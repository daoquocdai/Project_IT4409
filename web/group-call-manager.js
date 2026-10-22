(function () {
  const api = window.MiniHermesCallAPI;
  const peers = new Map();
  let currentCall = null, localStream = null, currentThread = null, selfUserID = "", serial = Promise.resolve(), cancelled = false;
  const ui = {};
  const $ = (id) => document.getElementById(id);

  function setCard(call) {
    if (!ui.card) return;
    const relevant = call && currentThread?.kind === "group" && call.thread_id === currentThread.id && call.status === "open";
    ui.card.hidden = !relevant;
    if (relevant) {
      const count = (call.participants || []).length;
      ui.cardText.textContent = `${count} người đang tham gia · ${call.media_type === "video" ? "Gọi video" : "Gọi thoại"}`;
      ui.join.textContent = currentCall?.id === call.id ? "Quay lại cuộc gọi" : "Tham gia";
      ui.join.onclick = () => currentCall?.id === call.id ? (ui.panel.hidden = false) : void join(call);
    }
  }
  async function observeThread(thread, userID) {
    currentThread = thread || null; selfUserID = userID || selfUserID;
    if (!thread || thread.kind !== "group") { setCard(null); return; }
    try { setCard(await api.groupActive(thread.id)); } catch (error) { if (error.status === 404) setCard(null); }
  }
  async function start(thread, mediaType, userID) {
    if (!thread || thread.kind !== "group") return window.MiniHermesCalls?.start(thread, mediaType);
    selfUserID = userID || selfUserID;
    if (currentCall) { ui.panel.hidden = false; return; }
    try { const room = await api.groupCreate(thread.id, mediaType); setCard(room); await join(room); } catch (error) { alert(error.status === 409 ? "Bạn đang trong cuộc gọi khác hoặc phòng đã đủ 4 người." : error.message); }
  }
  async function join(room) {
    if (currentCall) return;
    cancelled = false; ui.panel.hidden = false; ui.title.textContent = currentThread?.name || "Cuộc gọi nhóm"; ui.status.textContent = "Đang xin quyền thiết bị…";
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: room.media_type === "video" ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 20, max: 24 } } : false });
      if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
      localStream = media; const joined = await api.groupJoin(room.id); currentCall = { ...joined, id: joined.id, selfSessionId: joined.self_session_id };
      mountSelf(); const ready = await api.groupReady(room.id, currentCall.selfSessionId); applySnapshot(ready); ui.status.textContent = "Đang kết nối…"; setCard(currentCall);
    } catch (error) { cleanup(); alert(error.status === 409 ? "Phòng đã đủ 4 người hoặc tài khoản đang gọi trên thiết bị khác." : `Không thể tham gia cuộc gọi: ${error.message}`); }
  }
  function participant(sessionID) { return currentCall?.participants?.find((item) => item.session_id === sessionID); }
  function mountTile(sessionID, name, own = false) {
    let tile = ui.grid.querySelector(`[data-session-id="${CSS.escape(sessionID)}"]`); if (tile) return tile;
    tile = document.createElement("article"); tile.className = "group-call-tile"; tile.dataset.sessionId = sessionID;
    const media = document.createElement("video"); media.autoplay = true; media.playsInline = true; media.muted = own;
    const avatar = document.createElement("span"); avatar.className = "group-call-avatar"; avatar.textContent = (name || "?").trim().charAt(0).toUpperCase();
    const label = document.createElement("strong"); label.textContent = own ? `${name || "Bạn"} (Bạn)` : name || "Thành viên";
    const status = document.createElement("small"); status.textContent = own ? "Đã kết nối" : "Đang kết nối…";
    tile.append(media, avatar, label, status); ui.grid.append(tile); return tile;
  }
  function mountSelf() { const me = participant(currentCall.selfSessionId); const tile = mountTile(currentCall.selfSessionId, me?.name || "Bạn", true); tile.querySelector("video").srcObject = localStream; tile.classList.toggle("has-video", localStream.getVideoTracks().length > 0); }
  function ensurePeer(remoteID) {
    if (peers.has(remoteID)) return peers.get(remoteID);
    const pc = new RTCPeerConnection({ iceServers: currentCall.ice_servers || [{ urls: ["stun:stun.l.google.com:19302"] }] });
    const state = { pc, pendingIce: [], queue: Promise.resolve(), offerStarted: false, closed: false };
    const remote = new MediaStream(), person = participant(remoteID), tile = mountTile(remoteID, person?.name);
    tile.querySelector("video").srcObject = remote;
    pc.ontrack = ({ track }) => { remote.addTrack(track); tile.classList.toggle("has-video", remote.getVideoTracks().length > 0); tile.querySelector("video").play().catch(() => {}); };
    pc.onicecandidate = ({ candidate }) => { if (candidate && !state.closed && currentCall) void api.groupSignal(currentCall.id, "group-call.ice", currentCall.selfSessionId, remoteID, candidate.toJSON()); };
    pc.onconnectionstatechange = () => { if (state.closed) return; tile.querySelector("small").textContent = ({ connected: "Đã kết nối", connecting: "Đang kết nối…", disconnected: "Mất kết nối", failed: "Kết nối lỗi" })[pc.connectionState] || "Đang chuẩn bị…"; };
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream)); peers.set(remoteID, state); return state;
  }
  function enqueue(remoteID, task) { const state = ensurePeer(remoteID); state.queue = state.queue.then(() => !state.closed && task(state)).catch((error) => { console.error("Group peer failed", error); state.closed = true; state.pc.close(); }); return state.queue; }
  function startPeer(remoteID) { if (!currentCall || currentCall.selfSessionId >= remoteID) return; const state = ensurePeer(remoteID); if (state.offerStarted) return; state.offerStarted = true; return enqueue(remoteID, async ({ pc }) => { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); if (!state.closed && currentCall) await api.groupSignal(currentCall.id, "group-call.offer", currentCall.selfSessionId, remoteID, pc.localDescription.toJSON()); }); }
  async function flushIce(state) { while (state.pendingIce.length && !state.closed) await state.pc.addIceCandidate(state.pendingIce.shift()); }
  function applySnapshot(snapshot) {
    if (!currentCall || snapshot.id !== currentCall.id || Number(snapshot.version) < Number(currentCall.version || 0)) return;
    currentCall = { ...currentCall, ...snapshot, selfSessionId: currentCall.selfSessionId }; const readyIDs = new Set();
    for (const person of currentCall.participants || []) if (person.status === "ready" && person.session_id !== currentCall.selfSessionId) { readyIDs.add(person.session_id); ensurePeer(person.session_id); void startPeer(person.session_id); }
    for (const id of [...peers.keys()]) if (!readyIDs.has(id)) removePeer(id); renderCount(); setCard(currentCall);
  }
  function renderCount() { const count = (currentCall?.participants || []).filter((p) => p.status === "ready").length; ui.status.textContent = count <= 1 ? "Đang chờ thành viên khác…" : `${count} người trong cuộc gọi`; ui.endAll.hidden = currentCall?.created_by !== selfUserID; }
  function removePeer(id) { const state = peers.get(id); if (state) { state.closed = true; state.pc.close(); peers.delete(id); } ui.grid.querySelector(`[data-session-id="${CSS.escape(id)}"]`)?.remove(); }
  async function signal(event) {
    if (!currentCall || event.call_id !== currentCall.id || event.target_session_id !== currentCall.selfSessionId || !participant(event.from_session_id)) return;
    await enqueue(event.from_session_id, async (state) => { const pc = state.pc; if (event.type === "group-call.offer") { await pc.setRemoteDescription(event.payload); await flushIce(state); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await api.groupSignal(currentCall.id, "group-call.answer", currentCall.selfSessionId, event.from_session_id, pc.localDescription.toJSON()); } else if (event.type === "group-call.answer") { await pc.setRemoteDescription(event.payload); await flushIce(state); } else if (pc.remoteDescription) await pc.addIceCandidate(event.payload); else if (state.pendingIce.length < 128) state.pendingIce.push(event.payload); });
  }
  async function handle(event) {
    if (!event.type?.startsWith("group-call.")) return;
    if (["group-call.offer", "group-call.answer", "group-call.ice"].includes(event.type)) return signal(event);
    const room = { id: event.call_id, thread_id: event.thread_id, ...(event.payload || {}) };
    if (event.type === "group-call.ended") { if (currentCall?.id === room.id) cleanup(); if (currentThread?.id === room.thread_id) setCard(null); return; }
    if (currentCall?.id === room.id) { if (Number(room.version) > Number(currentCall.version || 0) + 1) { try { applySnapshot(await api.groupGet(room.id)); } catch (_) {} } else applySnapshot(room); }
    else if (currentThread?.id === room.thread_id) setCard(room);
  }
  async function reconcile() { if (!currentCall) return; try { const latest = await api.groupGet(currentCall.id); if (latest.status === "ended") cleanup(); else applySnapshot(latest); } catch (_) { cleanup(); } }
  function cleanup() { cancelled = true; for (const id of [...peers.keys()]) removePeer(id); localStream?.getTracks().forEach((track) => track.stop()); localStream = null; currentCall = null; ui.grid?.replaceChildren(); if (ui.panel) ui.panel.hidden = true; setCard(null); if (currentThread?.kind === "group") void observeThread(currentThread, selfUserID); }
  async function leave() { const id = currentCall?.id, session = currentCall?.selfSessionId; cleanup(); if (id && session) try { await api.groupLeave(id, session); } catch (_) {} }
  async function endAll() { const id = currentCall?.id; if (!id) return; try { await api.groupEnd(id); cleanup(); } catch (error) { alert(error.message); } }

  window.addEventListener("DOMContentLoaded", () => {
    Object.assign(ui, { card: $("group-call-card"), cardText: $("group-call-card-text"), join: $("join-group-call"), panel: $("group-call-panel"), grid: $("group-call-grid"), title: $("group-call-title"), status: $("group-call-status"), mic: $("group-mic-btn"), camera: $("group-camera-btn"), leave: $("leave-group-call-btn"), endAll: $("end-group-call-btn") });
    ui.mic.onclick = () => { const track = localStream?.getAudioTracks()[0]; if (track) { track.enabled = !track.enabled; ui.mic.setAttribute("aria-pressed", String(!track.enabled)); ui.mic.textContent = track.enabled ? "Mic" : "Bật mic"; } };
    ui.camera.onclick = () => { const track = localStream?.getVideoTracks()[0]; if (track) { track.enabled = !track.enabled; ui.camera.setAttribute("aria-pressed", String(!track.enabled)); ui.camera.textContent = track.enabled ? "Camera" : "Bật camera"; } };
    ui.leave.onclick = () => void leave(); ui.endAll.onclick = () => void endAll(); $("minimize-group-call-btn").onclick = () => { ui.panel.hidden = true; setCard(currentCall); };
  });
  window.MiniHermesGroupCalls = { start, observeThread, reconcile, handleEvent: (event) => { serial = serial.then(() => handle(event)).catch(console.error); } };
})();
