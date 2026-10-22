(function () {
  const api = window.MiniHermesCallAPI;
  const ui = {};
  let call = null, peer = null, stream = null, pendingIce = [], serial = Promise.resolve();
  let connectedReported = false, durationTimer = null, connectedAt = 0, disconnectTimer = null;
  const byID = (id) => document.getElementById(id);
  const setStatus = (text) => { ui.status.textContent = text; };
  function peerName(value) { return value?.caller_name || value?.peerName || "Người dùng Mini Hermes"; }
  function showPanel(value) { ui.incoming.hidden = true; ui.panel.hidden = false; ui.peer.textContent = peerName(value); ui.camera.hidden = value.media_type !== "video"; }
  async function prepare(value) {
    showPanel(value); setStatus("Đang xin quyền thiết bị…");
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: value.media_type === "video" ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } } : false });
    if (!call || call.id !== value.id) { stream.getTracks().forEach((track) => track.stop()); throw new Error("Cuộc gọi đã kết thúc."); }
    ui.local.srcObject = stream;
    const config = await api.ice(value.id);
    peer = new RTCPeerConnection({ iceServers: config.iceServers || [] });
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    const remote = new MediaStream(); ui.remote.srcObject = remote;
    peer.ontrack = ({ track }) => { remote.addTrack(track); ui.remote.play().catch(() => { ui.resume.hidden = false; }); };
    peer.onicecandidate = ({ candidate }) => { if (candidate && call) void api.signal(call.id, "call.ice", candidate.toJSON()); };
    peer.onconnectionstatechange = () => {
      if (!peer || !call) return;
      if (peer.connectionState === "connected") { clearTimeout(disconnectTimer); setStatus("Đã kết nối"); startDuration(); if (!connectedReported) { connectedReported = true; void api.connected(call.id); } }
      else if (peer.connectionState === "connecting") setStatus("Đang kết nối…");
      else if (peer.connectionState === "disconnected") { setStatus("Kết nối gián đoạn…"); disconnectTimer = setTimeout(() => void finish("failed"), 10000); }
      else if (peer.connectionState === "failed") void finish("failed");
    };
  }
  function startDuration() { if (durationTimer) return; connectedAt = Date.now(); durationTimer = setInterval(() => { const seconds = Math.floor((Date.now()-connectedAt)/1000); ui.duration.textContent = `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`; },1000); }
  async function sendOffer() { const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await api.signal(call.id,"call.offer",peer.localDescription.toJSON()); }
  async function receiveOffer(offer) { await peer.setRemoteDescription(offer); await flushIce(); const answer=await peer.createAnswer();await peer.setLocalDescription(answer);await api.signal(call.id,"call.answer",peer.localDescription.toJSON()); }
  async function flushIce(){while(pendingIce.length&&peer?.remoteDescription)await peer.addIceCandidate(pendingIce.shift());}
  function cleanup(){clearInterval(durationTimer);clearTimeout(disconnectTimer);durationTimer=null;disconnectTimer=null;peer?.close();peer=null;stream?.getTracks().forEach((track)=>track.stop());stream=null;ui.local.srcObject=null;ui.remote.srcObject=null;ui.panel.hidden=true;ui.incoming.hidden=true;ui.duration.textContent="00:00";pendingIce=[];connectedReported=false;call=null;}
  async function finish(reason=""){const id=call?.id;cleanup();if(id)try{await api.end(id,reason);}catch(_) {}}
  async function reconcile(){if(!call)return;try{const latest=await api.get(call.id);if(latest.status==="ended")cleanup();else if(!peer&&latest.status!=="ringing"){alert("Kết nối cuộc gọi bị gián đoạn. Vui lòng thử lại.");await finish("failed")}}catch(_){cleanup()}}
  async function start(thread,mediaType){if(!thread||thread.kind!=="direct")return;if(call){setStatus("Bạn đang trong một cuộc gọi.");return}try{const created=await api.create(thread.id,mediaType);call={...created,peerName:thread.peer?.username,isCaller:true};call.ready=prepare(call);await call.ready;if(!call.accepted)setStatus("Đang đổ chuông…");}catch(error){cleanup();alert(error.status===409?"Bạn hoặc người nhận đang có cuộc gọi khác.":error.message)} }
  async function accept(){if(!call)return;try{call.acceptedHere=true;call.ready=prepare(call);await call.ready;await api.accept(call.id);setStatus("Đang kết nối…");}catch(error){if(call)call.acceptedHere=false;await finish("failed");alert("Không thể truy cập mic/camera: "+error.message)}}
  async function handle(event){
    if(event.type==="call.invited"){if(call&&call.id!==event.call_id){void api.reject(event.call_id);return}call={id:event.call_id,thread_id:event.thread_id,caller_id:event.caller_id,callee_id:event.callee_id,caller_name:event.caller_name,media_type:event.media_type,isCaller:false};ui.title.textContent=peerName(call);ui.kind.textContent=call.media_type==="video"?"Cuộc gọi video":"Cuộc gọi thoại";ui.incoming.hidden=false;return}
    if(!call||event.call_id!==call.id)return;
    if(event.type==="call.accepted"&&call.isCaller){call.accepted=true;setStatus("Đang kết nối…");await call.ready;await sendOffer()}
    else if(event.type==="call.accepted"&&!call.isCaller&&!call.acceptedHere){cleanup()}
    else if(event.type==="call.ended"){const reason=event.end_reason;cleanup();if(reason==="rejected")alert("Người nhận đã từ chối cuộc gọi.");else if(reason==="missed")alert("Cuộc gọi không được trả lời.")}
    else if(event.type==="call.offer"&&!call.isCaller&&call.acceptedHere)await receiveOffer(event.payload)
    else if(event.type==="call.answer"&&call.isCaller){await peer.setRemoteDescription(event.payload);await flushIce()}
    else if(event.type==="call.ice"&&(call.isCaller||call.acceptedHere)){if(peer?.remoteDescription)await peer.addIceCandidate(event.payload);else pendingIce.push(event.payload)}
  }
  window.addEventListener("DOMContentLoaded",()=>{Object.assign(ui,{incoming:byID("incoming-call"),title:byID("incoming-call-title"),kind:byID("incoming-call-kind"),panel:byID("call-panel"),status:byID("call-status"),duration:byID("call-duration"),peer:byID("call-peer-name"),local:byID("local-video"),remote:byID("remote-media"),resume:byID("resume-audio-btn"),mic:byID("mic-btn"),camera:byID("camera-btn")});byID("accept-call-btn").onclick=()=>void accept();byID("reject-call-btn").onclick=()=>{const id=call?.id;cleanup();if(id)void api.reject(id)};byID("end-call-btn").onclick=()=>void finish();ui.mic.onclick=()=>{const track=stream?.getAudioTracks()[0];if(track){track.enabled=!track.enabled;ui.mic.setAttribute("aria-pressed",String(!track.enabled));ui.mic.textContent=track.enabled?"Mic":"Bật mic"}};ui.camera.onclick=()=>{const track=stream?.getVideoTracks()[0];if(track){track.enabled=!track.enabled;ui.camera.setAttribute("aria-pressed",String(!track.enabled));ui.camera.textContent=track.enabled?"Camera":"Bật camera"}};ui.resume.onclick=()=>ui.remote.play().then(()=>ui.resume.hidden=true);});
  window.MiniHermesCalls={start,reconcile,handleEvent:(event)=>{serial=serial.then(()=>handle(event)).catch((error)=>{console.error(error);void finish("failed")})}};
})();
