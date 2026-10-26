const sessionTokenKey = "mini-hermes.access-token";
const sessionUsernameKey = "mini-hermes.username";
const sessionVaultKey = "mini-hermes.vault-key.v2";
const sessionVaultUserKey = "mini-hermes.vault-user.v2";
const messagePageLimit = 30;
const threadSummaryDebounceMs = 750;
const websocketConnectTimeoutMs = 10000;
const websocketHeartbeatTimeoutMs = 15000;
const websocketResumeGraceMs = 5000;
const historyBottomTolerance = 4;
const pendingSendMismatchMessage = "Tin trước chưa được xác nhận. Khôi phục đúng nội dung cũ để bấm Gửi lại; chỉ gửi tin mới sau khi tin cũ thành công.";
const groupContentValidationMessage = "Tin nhắn cần có từ 1 đến 1000 ký tự Unicode sau khi bỏ khoảng trắng đầu/cuối và không chứa NUL.";

const authView = document.querySelector("#auth-view");
const chatView = document.querySelector("#chat-view");
const registerForm = document.querySelector("#register-form");
const loginForm = document.querySelector("#login-form");
const registerButton = document.querySelector("#register-button");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const currentUsername = document.querySelector("#current-username");
const peerList = document.querySelector("#peer-list");
const directThreadList = document.querySelector("#direct-thread-list");
const groupThreadList = document.querySelector("#group-thread-list");
const newDirectSection = document.querySelector("#new-direct-section");
const refreshUsersButton = document.querySelector("#refresh-users-button");
const peerName = document.querySelector("#peer-name");
const threadStatus = document.querySelector("#thread-status");
const historyElement = document.querySelector("#history");
const messageForm = document.querySelector("#message-form");
const contentInput = document.querySelector("#content");
const sendButton = document.querySelector("#send-button");
const voiceRecordButton = document.querySelector("#voice-record-button");
const voiceRecording = document.querySelector("#voice-recording");
const voiceRecordingDuration = document.querySelector("#voice-recording-duration");
const voiceCancelButton = document.querySelector("#voice-cancel-button");
const voiceStopButton = document.querySelector("#voice-stop-button");
const voicePreview = document.querySelector("#voice-preview");
const voicePreviewPlayer = document.querySelector("#voice-preview-player");
const voicePreviewDuration = document.querySelector("#voice-preview-duration");
const voiceDiscardButton = document.querySelector("#voice-discard-button");
const voiceSendButton = document.querySelector("#voice-send-button");
const emojiWrapper = document.querySelector("#emoji-wrapper");
const emojiToggle = document.querySelector("#emoji-toggle");
const emojiPicker = document.querySelector("#emoji-picker");
const attachmentButton = document.querySelector("#attachment-button");
const attachmentInput = document.querySelector("#attachment-input");
const attachmentDraft = document.querySelector("#attachment-draft");
const attachmentName = document.querySelector("#attachment-name");
const attachmentSize = document.querySelector("#attachment-size");
const removeAttachmentButton = document.querySelector("#remove-attachment");
const loadOlderButton = document.querySelector("#load-older-button");
const noticeElement = document.querySelector("#notice");
const errorElement = document.querySelector("#error");
const groupForm = document.querySelector("#group-form");
const groupUsers = document.querySelector("#group-users");
const createGroupButton = document.querySelector("#create-group-button");
const recoverGroupButton = document.querySelector("#recover-group-button");
const membersButton = document.querySelector("#members-button");
const membersPanel = document.querySelector("#members-panel");
const memberList = document.querySelector("#member-list");
const addMemberForm = document.querySelector("#add-member-form");
const addMemberUser = document.querySelector("#add-member-user");
const addMemberButton = document.querySelector("#add-member-button");
const leaveButton = document.querySelector("#leave-button");
const e2eePanel = document.querySelector("#e2ee-panel");
const e2eeStatus = document.querySelector("#e2ee-status");
const e2eePending = document.querySelector("#e2ee-pending");
const e2eePendingInfo = document.querySelector("#e2ee-pending-info");
const e2eePendingList = document.querySelector("#e2ee-pending-list");
const e2eeDecryptRetry = document.querySelector("#e2ee-decrypt-retry");
const emptyConversation = document.querySelector("#empty-conversation");
const activeConversation = document.querySelector("#active-conversation");
const conversationAvatar = document.querySelector("#conversation-avatar");
const accountAvatar = document.querySelector("#account-avatar");
const conversationSearch = document.querySelector("#conversation-search");
const conversationFilters = document.querySelector("#conversation-filters");
const newConversationButton = document.querySelector("#new-conversation-button");
const emptyNewConversation = document.querySelector("#empty-new-conversation");
const composeDialog = document.querySelector("#new-conversation-dialog");
const closeComposeDialog = document.querySelector("#close-compose-dialog");
const directTab = document.querySelector("#direct-tab");
const groupTab = document.querySelector("#group-tab");
const directComposePanel = document.querySelector("#direct-compose-panel");
const peopleSearch = document.querySelector("#people-search");
const groupUserSearch = document.querySelector("#group-user-search");
const selectedMembers = document.querySelector("#selected-members");
const callButton = document.querySelector("#call-button");
const videoCallButton = document.querySelector("#video-call-button");
const moreButton = document.querySelector("#more-button");
const closeInfoButton = document.querySelector("#close-info-button");
const groupManagement = document.querySelector("#group-management");
const infoAvatar = document.querySelector("#info-avatar");
const infoTitle = document.querySelector("#info-title");
const infoDescription = document.querySelector("#info-description");
const newMessagesButton = document.querySelector("#new-messages-button");
const backToListButton = document.querySelector("#back-to-list-button");
const emojis = ["🙂", "😀", "😂", "🥰", "😍", "😎", "🥹", "😭", "😡", "🤔", "👍", "👎", "❤️", "🔥", "🎉", "👏", "🙏", "💯"];
const emojiOnlyPattern = /^(?:(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)(?:\s*))+$/u;
const maximumAttachmentBytes = 20 * 1024 * 1024;
const maximumVoiceBytes = 5 * 1024 * 1024;
const previewImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
let selectedAttachmentFile = null;
const attachmentObjectURLs = new Set();
let voiceDraft = null;
let voicePreviewURL = null;
let voiceState = "idle";
let voiceTimer = null;
let voiceRecorder = null;
let voicePreviewPlayButton = null;
let voicePreviewProgress = null;
const e2eeLabels = {
  initializing: "Đang chuẩn bị chat...", ready: "Đã mã hóa đầu cuối.",
  error: "Chưa thể mở cuộc trò chuyện. Vui lòng đăng nhập lại.",
};

const state = {
  token: "", sessionVersion: 0, sessionAbort: new AbortController(),
  currentUserID: "", currentUsername: "", users: [], usersRequest: null,
  // One entry per thread: summary, permissions, messages, drafts and requests.
  threads: new Map(), directRequestsByPeer: new Map(),
  threadID: "", currentCache: null, conversationVersion: 0,
  readFrame: null, readSerial: 0,
  membershipSerial: 0, threadListRequest: null, threadListDirty: false,
  threadListCatchup: false, threadSummaryTimer: null, groupCreation: null,
  socket: null, socketConnecting: false, socketGeneration: 0,
  socketTicketAbort: null, socketHealthTimer: null, socketLastActivityAt: 0,
  socketSummaryStale: false, reconnectTimer: null, reconnectDelay: 1000,
  recallCursor: 0, recallSyncRequest: null,
  e2ee: null, vaultKey: "", authBusy: false,
  conversationFilter: "all", conversationSearch: "",
};

function showNotice(message) {
  noticeElement.textContent = message;
  noticeElement.hidden = !message;
}
function errorMessage(error) {
  switch (error?.details?.error) {
    case "invalid username or password": return "Tên tài khoản hoặc mật khẩu không đúng.";
    case "username already exists": return "Tên tài khoản đã được sử dụng.";
    case "user not found": return "Không tìm thấy tài khoản.";
    case "username must contain between 1 and 50 Unicode characters and cannot contain NUL":
      return "Tên tài khoản cần có từ 1 đến 50 ký tự hợp lệ.";
    case "group name must contain between 1 and 100 Unicode characters and cannot contain NUL":
      return "Tên nhóm cần có từ 1 đến 100 ký tự hợp lệ.";
    case "a group supports at most 100 active members": return "Nhóm chỉ có thể có tối đa 100 thành viên.";
  }
  switch (error?.status) {
    case 400: return "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.";
    case 401: return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    case 403: return "Bạn không có quyền thực hiện thao tác này.";
    case 404: return "Không tìm thấy dữ liệu cần tải.";
    case 409: return "Chưa thể thực hiện thao tác này. Vui lòng tải lại cuộc trò chuyện và thử lại.";
    case 413: return "Nội dung quá dài. Vui lòng rút ngắn rồi thử lại.";
  }
  return "Chưa thể hoàn tất thao tác. Vui lòng thử lại.";
}
function showError(message) {
  if (typeof message !== "string") message = errorMessage(message);
  errorElement.textContent = message;
  errorElement.hidden = !message;
}
function canUseThread(cache) {
  return Boolean(cache?.summary && cache.active && !cache.permissionsPending);
}
function hasEncryptedMessages(cache) {
  if (!cache) return false;
  for (const messages of [cache.messages, cache.eventMessages]) {
    for (const message of messages.values()) {
      if (message.content_format === "e2ee_v2") return true;
    }
  }
  return false;
}
function canSendPlaintext(cache) {
  return canUseThread(cache) && cache.summary.kind === "group" && !hasEncryptedMessages(cache);
}
function canSendE2EE(cache) {
  return canUseThread(cache) && !cache.payloadConflict && cache.summary.kind === "direct" && Boolean(state.e2ee?.canSend(cache.summary));
}
function renderE2EEPanel() {
  const local = state.e2ee?.snapshot() || { status: "initializing", pending: [] };
  e2eePanel.hidden = local.status === "ready" && local.pending.length === 0;
  e2eeStatus.hidden = local.status === "ready";
  e2eeStatus.dataset.status = local.status;
  e2eeStatus.textContent = e2eeLabels[local.status] || e2eeLabels.error;
  e2eePending.hidden = local.pending.length === 0;
  e2eePendingInfo.textContent = `${local.pending.length} tin chưa được xác nhận.`;
  e2eePendingList.replaceChildren();
  for (const item of local.pending) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    const thread = state.threads.get(item.thread_id)?.summary;
    button.textContent = `Gửi lại · ${thread ? threadTitle(thread) : "Chat 1-1"}`;
    button.disabled = !state.e2ee?.canRead();
    button.addEventListener("click", () => runE2EEAction((client) => retryE2EE(client, item.message_id)));
    e2eePendingList.append(button);
  }
  renderPeerList();
}
async function startE2EE() {
  const sessionVersion = state.sessionVersion, token = state.token, userID = state.currentUserID;
  if (!currentSessionMatches(sessionVersion, token) || !state.users.some((user) => user.id === userID) || state.e2ee) return;
  const current = () => currentSessionMatches(sessionVersion, token) && state.currentUserID === userID;
  const client = MiniHermesE2EEClient.create({ apiURL: location.origin, userID, current,
    username: state.currentUsername, vaultKey: state.vaultKey,
    request: async (path, options) => {
      if (!current()) throw new Error("Phiên E2EE đã thay đổi.");
      const response = await apiRequest(path, options);
      if (!current()) throw new Error("Phiên E2EE đã thay đổi.");
      return response;
    },
    onChange: () => {
      if (!current() || state.e2ee !== client) return;
      renderE2EEPanel();
      renderThreadHeading();
      if (client.canRead()) for (const cache of state.threads.values()) processE2EEMessages(cache);
    },
  });
  state.e2ee = client;
  renderE2EEPanel();
  await client.start();
}
function updateSendButton() {
  const cache = state.currentCache;
  const pending = cache?.pendingSend;
  const encrypted = cache?.summary?.kind === "direct";
  const allowed = encrypted ? canSendE2EE(cache) : canSendPlaintext(cache);
  const busy = Boolean(pending?.inFlight) || Boolean(cache?.e2eeSending);
  const recording = ["requesting", "recording", "stopping", "cancelling"].includes(voiceState);
  const hasVoice = Boolean(voiceDraft);
  const hasTextOrFile = Boolean(contentInput.value.trim() || selectedAttachmentFile);
  sendButton.textContent = !encrypted && pending ? "Gửi lại" : "Gửi";
  sendButton.hidden = !hasTextOrFile || recording || hasVoice;
  sendButton.disabled = !allowed || busy;
  voiceRecordButton.hidden = hasTextOrFile || recording || hasVoice;
  voiceRecordButton.disabled = !allowed || busy || !encrypted;
  voiceRecordButton.title = encrypted ? "Ghi âm tin nhắn thoại" : "Tin nhắn thoại E2EE hiện chỉ hỗ trợ chat cá nhân";
  contentInput.disabled = !allowed || busy || recording || hasVoice;
  emojiToggle.disabled = contentInput.disabled;
  attachmentButton.disabled = !allowed || busy || recording || hasVoice;
  attachmentButton.title = cache?.summary?.kind === "group"
    ? "Tệp E2EE cho nhóm chưa được hỗ trợ" : "Đính kèm tệp (tối đa 20 MiB)";
  if (emojiToggle.disabled) closeEmojiPicker();
  // HTML maxlength counts UTF-16 units; group validation counts Unicode points.
  if (encrypted) contentInput.maxLength = 2000;
  else contentInput.removeAttribute("maxlength");
  voiceRecording.hidden = !recording;
  voicePreview.hidden = !hasVoice;
  voiceCancelButton.disabled = voiceState === "stopping";
  voiceStopButton.disabled = voiceState !== "recording";
  voiceDiscardButton.disabled = busy;
  voiceSendButton.disabled = !allowed || busy || !hasVoice;
}
function validGroupContent(content) {
  // Match Go strings.TrimSpace (U+0085 is whitespace, U+FEFF is not).
  const trimmed = content.replace(/^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g, "");
  const length = [...trimmed].length;
  return length >= 1 && length <= 1000 && !trimmed.includes("\u0000");
}
function isEmojiOnly(content) {
  return emojiOnlyPattern.test(content.trim());
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function safeAttachmentName(name) {
  const normalized = String(name || "attachment").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return [...(normalized || "attachment")].slice(0, 180).join("");
}
async function encryptAttachment(file) {
  if (!(file instanceof Blob) || file.size <= 0) throw new Error("Tệp phải lớn hơn 0 byte.");
  if (file.size > maximumAttachmentBytes) throw new Error("Tệp không được vượt quá 20 MiB.");
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, await file.arrayBuffer());
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { blob: new Blob([encrypted], { type: "application/octet-stream" }), descriptor: {
    version: 1, algorithm: "AES-256-GCM", key: bytesToBase64(rawKey), iv: bytesToBase64(iv),
    name: safeAttachmentName(file.name), mimeType: file.type || "application/octet-stream", sizeBytes: file.size,
  } };
}
function parseAttachmentMessage(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed?.version !== 1 || !["attachment", "voice"].includes(parsed.type) || typeof parsed.text !== "string" ||
        !Array.isArray(parsed.attachments) || parsed.attachments.length < 1 || parsed.attachments.length > 5) return null;
    if (parsed.type === "voice" && (parsed.attachments.length !== 1 || !Number.isSafeInteger(parsed.durationMs) || parsed.durationMs < 0 || parsed.durationMs > 120_000)) return null;
    for (const item of parsed.attachments) {
      if (typeof item?.attachmentId !== "string" || item.algorithm !== "AES-256-GCM" ||
          typeof item.key !== "string" || base64ToBytes(item.key).length !== 32 ||
          typeof item.iv !== "string" || base64ToBytes(item.iv).length !== 12 ||
          typeof item.name !== "string" || typeof item.mimeType !== "string" ||
          !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes <= 0 || item.sizeBytes > maximumAttachmentBytes) return null;
      if (parsed.type === "voice" && (!item.mimeType.startsWith("audio/") || item.sizeBytes > maximumVoiceBytes)) return null;
    }
    return parsed;
  } catch { return null; }
}
function formatDuration(durationMs) {
  const seconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function clearVoiceDraft() {
  if (voiceTimer !== null) window.clearInterval(voiceTimer);
  voiceTimer = null;
  voicePreviewPlayer.pause();
  voicePreviewPlayer.removeAttribute("src");
  voicePreviewPlayer.load();
  if (voicePreviewURL) URL.revokeObjectURL(voicePreviewURL);
  voicePreviewURL = null;
  voiceDraft = null;
  updateSendButton();
}
function displayVoicePreview(recording) {
  clearVoiceDraft();
  if (recording.blob.size > maximumVoiceBytes) {
    showError("Bản ghi âm vượt quá 5 MiB. Hãy ghi âm ngắn hơn rồi thử lại.");
    return;
  }
  const extension = recording.mimeType.includes("mp4") ? "m4a" : recording.mimeType.includes("ogg") ? "ogg" : "webm";
  voiceDraft = { ...recording, file: new File([recording.blob], `voice-message.${extension}`, { type: recording.mimeType }), prepared: null };
  voicePreviewURL = URL.createObjectURL(recording.blob);
  voicePreviewPlayer.src = voicePreviewURL;
  voicePreviewDuration.textContent = formatDuration(recording.durationMs);
  if (voicePreviewProgress) voicePreviewProgress.value = "0";
  showError("");
  updateSendButton();
}
function updateVoiceState(nextState) {
  voiceState = nextState;
  if (voiceTimer !== null) window.clearInterval(voiceTimer);
  voiceTimer = null;
  if (nextState === "recording") {
    voiceTimer = window.setInterval(() => {
      voiceRecordingDuration.textContent = formatDuration(performance.now() - voiceRecorder?.startedAt);
    }, 250);
  }
  if (nextState === "requesting") voiceRecordingDuration.textContent = "00:00";
  updateSendButton();
}
function initializeVoiceRecorder() {
  enhanceVoiceComposer();
  if (!window.MiniHermesVoiceRecorder) return;
  voiceRecorder = new window.MiniHermesVoiceRecorder({
    onState: updateVoiceState,
    onReady: displayVoicePreview,
    onError: (error) => showError(error instanceof Error ? error.message : "Không thể ghi âm."),
  });
}
function voiceIcon(pathData, extra = null) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("viewBox", "0 0 24 24");
  const element = document.createElementNS("http://www.w3.org/2000/svg", extra ? "rect" : "path");
  if (extra) Object.entries(extra).forEach(([name, value]) => element.setAttribute(name, value));
  else element.setAttribute("d", pathData);
  svg.append(element);
  return svg;
}
function enhanceVoiceComposer() {
  if (voicePreviewPlayButton) return;
  voiceCancelButton.className = "voice-icon-button voice-cancel";
  voiceCancelButton.setAttribute("aria-label", "Hủy bản ghi");
  voiceCancelButton.replaceChildren(voiceIcon("M3 6h18M9 6V4h6v2M7 6l1 15h8l1-15M10 10v7M14 10v7"));
  voiceStopButton.className = "voice-icon-button voice-stop";
  voiceStopButton.setAttribute("aria-label", "Dừng ghi âm");
  voiceStopButton.replaceChildren(voiceIcon("", { x: "7", y: "7", width: "10", height: "10", rx: "1" }));
  const label = voiceRecording.querySelector("span:not(.voice-recording-dot)");
  if (label) label.className = "voice-recording-label";
  const wave = document.createElement("span"); wave.className = "voice-wave"; wave.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 5; index += 1) wave.append(document.createElement("i"));
  voiceRecordingDuration.before(wave);
  voiceDiscardButton.className = "voice-icon-button voice-cancel";
  voiceDiscardButton.setAttribute("aria-label", "Xóa bản ghi");
  voiceDiscardButton.replaceChildren(voiceIcon("M3 6h18M9 6V4h6v2M7 6l1 15h8l1-15M10 10v7M14 10v7"));
  voicePreviewPlayer.controls = false;
  voicePreviewPlayButton = document.createElement("button");
  voicePreviewPlayButton.type = "button"; voicePreviewPlayButton.className = "voice-icon-button voice-play";
  voicePreviewPlayButton.setAttribute("aria-label", "Phát bản ghi"); voicePreviewPlayButton.append(voiceIcon("m9 6 9 6-9 6Z"));
  voicePreviewProgress = document.createElement("input");
  voicePreviewProgress.className = "voice-progress"; voicePreviewProgress.type = "range"; voicePreviewProgress.min = "0"; voicePreviewProgress.max = "1000"; voicePreviewProgress.value = "0"; voicePreviewProgress.setAttribute("aria-label", "Tiến trình bản ghi");
  voicePreviewPlayer.after(voicePreviewPlayButton, voicePreviewProgress);
  voicePreviewPlayButton.addEventListener("click", () => {
    if (voicePreviewPlayer.paused) void voicePreviewPlayer.play(); else voicePreviewPlayer.pause();
  });
  voicePreviewPlayer.addEventListener("play", () => { voicePreviewPlayButton.replaceChildren(voiceIcon("M8 6v12M16 6v12")); voicePreviewPlayButton.setAttribute("aria-label", "Dừng nghe bản ghi"); });
  voicePreviewPlayer.addEventListener("pause", () => { voicePreviewPlayButton.replaceChildren(voiceIcon("m9 6 9 6-9 6Z")); voicePreviewPlayButton.setAttribute("aria-label", "Phát bản ghi"); });
  voicePreviewPlayer.addEventListener("timeupdate", () => {
    if (Number.isFinite(voicePreviewPlayer.duration) && voicePreviewPlayer.duration > 0) {
      voicePreviewProgress.value = String(Math.round(voicePreviewPlayer.currentTime / voicePreviewPlayer.duration * 1000));
      voicePreviewDuration.textContent = `${formatDuration(voicePreviewPlayer.currentTime * 1000)} / ${formatDuration(voicePreviewPlayer.duration * 1000)}`;
    }
  });
  voicePreviewProgress.addEventListener("input", () => {
    if (Number.isFinite(voicePreviewPlayer.duration)) voicePreviewPlayer.currentTime = Number(voicePreviewProgress.value) / 1000 * voicePreviewPlayer.duration;
  });
}
function clearSelectedAttachment() {
  selectedAttachmentFile = null;
  attachmentInput.value = "";
  attachmentDraft.hidden = true;
  attachmentName.textContent = "";
  attachmentSize.textContent = "";
}
function revokeAttachmentURLs() {
  for (const url of attachmentObjectURLs) URL.revokeObjectURL(url);
  attachmentObjectURLs.clear();
}
function closeEmojiPicker({ restoreFocus = false } = {}) {
  emojiPicker.hidden = true;
  emojiToggle.setAttribute("aria-expanded", "false");
  if (restoreFocus && !contentInput.disabled) contentInput.focus();
}
function renderThreadHeading() {
  const cache = state.currentCache;
  const thread = cache?.summary;
  emptyConversation.hidden = Boolean(thread);
  activeConversation.hidden = !thread;
  if (!thread) {
    membersPanel.hidden = true;
    return;
  }
  peerName.textContent = thread ? threadTitle(thread) : "Chọn cuộc trò chuyện";
  conversationAvatar.textContent = avatarInitial(threadTitle(thread));
  const group = thread?.kind === "group";
  threadStatus.textContent = group
    ? !cache.active ? "Bạn không còn trong nhóm này."
      : cache.permissionsPending ? "Đang cập nhật nhóm..."
      : `${thread.member_count} thành viên · ${thread.role === "admin" ? "Quản trị viên" : "Thành viên"}`
    : thread?.kind === "direct" || hasEncryptedMessages(cache)
      ? e2eeLabels[state.e2ee?.snapshot().status] || e2eeLabels.initializing
      : "";
  membersButton.hidden = !cache.active;
  if (!cache.active) membersPanel.hidden = true;
  e2eeDecryptRetry.hidden = !cache || ![...cache.decryptedViews.values()].some((view) => view.status === "error");
  e2eeDecryptRetry.disabled = !state.e2ee?.canRead();
  updateSendButton();
  if (!membersPanel.hidden) renderConversationInfo(cache);
}
function decodeSubject(token) {
  try {
    const normalized = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))).sub || "";
  } catch { return ""; }
}
async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "Yêu cầu không thành công.");
    error.status = response.status;
    error.details = body; // Preserve committed thread/message IDs and seq on 503.
    throw error;
  }
  return body;
}
async function apiRequest(path, options = {}, authenticated = true) {
  const requestToken = state.token;
  const requestSessionVersion = state.sessionVersion;
  const headers = new Headers(options.headers || {});
  if (authenticated) headers.set("Authorization", `Bearer ${requestToken}`);
  const signal = options.signal
    ? AbortSignal.any([state.sessionAbort.signal, options.signal]) : state.sessionAbort.signal;
  const response = await fetch(path, { ...options, headers, signal });
  if (authenticated && response.status === 401 &&
      currentSessionMatches(requestSessionVersion, requestToken)) {
    clearSession();
    if (location.pathname === "/app" && typeof location.replace === "function") location.replace("/login");
    else showError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }
  return readResponse(response);
}
async function sendMessageWithRetry(snapshot, messageID, content) {
  const request = { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id: messageID, content }) };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!canSendPlaintext(snapshot.cache)) {
      if (!snapshot.cache?.summary) scheduleThreadSummaryRefresh();
      throw new Error("Chưa thể gửi vào cuộc trò chuyện này.");
    }
    try { return await apiRequest(`/threads/${snapshot.threadID}/messages`, request); }
    catch (error) {
      if (attempt === 1 || (error.status !== undefined && error.status < 500) ||
          !cacheSnapshotMatches(snapshot) || !canSendPlaintext(snapshot.cache)) throw error;
    }
  }
}
function resetConversation() {
  revokeAttachmentURLs();
  clearSelectedAttachment();
  if (voiceRecorder && voiceState !== "idle") voiceRecorder.cancel();
  clearVoiceDraft();
  state.threadID = "";
  state.currentCache = null;
  state.conversationVersion += 1;
  peerName.textContent = "Chọn cuộc trò chuyện";
  threadStatus.textContent = "";
  historyElement.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = "Chọn tài khoản hoặc nhóm để bắt đầu chat.";
  historyElement.append(empty);
  contentInput.value = "";
  membersPanel.hidden = true;
  emptyConversation.hidden = false;
  activeConversation.hidden = true;
  membersButton.hidden = true;
  updateSendButton();
  loadOlderButton.hidden = true;
}
function clearSession() {
  if (voiceRecorder && voiceState !== "idle") voiceRecorder.cancel();
  clearVoiceDraft();
  const previousE2EE = state.e2ee;
  state.e2ee = null;
  if (previousE2EE) void previousE2EE.close();
  stopWebSocket();
  state.sessionAbort.abort();
  state.sessionAbort = new AbortController();
  try {
    for (const key of [sessionTokenKey, sessionUsernameKey, sessionVaultKey, sessionVaultUserKey]) sessionStorage.removeItem(key);
  } catch (_) { /* Browser storage is an optional session cache. */ }
  state.sessionVersion += 1;
  state.token = "";
  state.vaultKey = "";
  state.currentUserID = "";
  state.currentUsername = "";
  state.users = [];
  state.usersRequest = null;
  refreshUsersButton.disabled = false;
  state.threads = new Map();
  state.directRequestsByPeer = new Map();
  state.threadListRequest = null;
  state.threadListDirty = false;
  state.threadListCatchup = false;
  state.recallCursor = 0;
  state.recallSyncRequest = null;
  state.membershipSerial = 0;
  state.groupCreation = null;
  if (state.readFrame !== null) cancelAnimationFrame(state.readFrame);
  state.readFrame = null;
  state.readSerial = 0;
  createGroupButton.disabled = false;
  recoverGroupButton.hidden = true;
  groupForm.reset();
  if (state.threadSummaryTimer !== null) clearTimeout(state.threadSummaryTimer);
  state.threadSummaryTimer = null;
  resetConversation();
  // Authentication has dedicated pages. Never reveal the legacy auth fixture
  // while /app is clearing a session or redirecting after logout/expiry.
  if (authView) authView.hidden = true;
  chatView.hidden = true;
  logoutButton.hidden = true;
  currentUsername.textContent = "";
  peerList.replaceChildren();
  directThreadList.replaceChildren();
  groupThreadList.replaceChildren();
  newDirectSection.hidden = true;
  groupUsers.replaceChildren();
  e2eePanel.hidden = true;
  e2eePending.hidden = true;
  e2eePendingInfo.textContent = "";
  e2eePendingList.replaceChildren();
}
function showChatView() {
  if (authView) authView.hidden = true;
  chatView.hidden = false;
  logoutButton.hidden = false;
  currentUsername.textContent = state.currentUsername;
  accountAvatar.textContent = avatarInitial(state.currentUsername);
}
function currentSessionMatches(sessionVersion, token) {
  return sessionVersion === state.sessionVersion && token === state.token && Boolean(token);
}
function conversationSnapshot() {
  return { ...cacheSnapshot(state.currentCache), version: state.conversationVersion };
}
function newThreadCache(threadID) {
  return { threadID, summary: null, active: false, permissionsPending: false,
    membershipEpoch: 0, members: null, membersDirty: true, membersRequest: null,
    memberMutation: null, eventMessages: new Map(), summaryBaseSeq: 0,
    messages: new Map(), messageIDs: new Map(), messagesLoaded: false,
    syncedSeq: 0, nextCursor: null, lastReadSeq: 0, peerLastReadSeq: 0,
    initialHistoryRequest: null, catchupRequest: null, catchupTargetSeq: 0,
    olderRequest: null, readRequest: null, pendingReadSeq: 0,
    pendingSend: null, draftContent: "", preparedAttachment: null, decryptedViews: new Map(), decryptJobs: new Map(), animatedMessageIDs: new Set(), recalls: new Map(),
    payloadConflict: false, e2eeSending: false };
}
function cacheForThread(threadID) {
  if (!state.threads.has(threadID)) state.threads.set(threadID, newThreadCache(threadID));
  return state.threads.get(threadID);
}
function cacheSnapshot(cache) {
  return { sessionVersion: state.sessionVersion, token: state.token,
    threadID: cache?.threadID || "", cache, membershipEpoch: cache?.membershipEpoch };
}
function cacheSnapshotMatches(snapshot) {
  return currentSessionMatches(snapshot.sessionVersion, snapshot.token) &&
    state.threads.get(snapshot.threadID) === snapshot.cache;
}
function currentConversationMatches(snapshot) {
  return cacheSnapshotMatches(snapshot) && snapshot.version === state.conversationVersion &&
    snapshot.threadID === state.threadID && snapshot.cache === state.currentCache;
}
function membershipSnapshotMatches(snapshot) {
  return cacheSnapshotMatches(snapshot) && snapshot.membershipEpoch === snapshot.cache.membershipEpoch;
}
function peerByID(id) { return state.users.find((user) => user.id === id); }
function threadTitle(thread) { return thread.kind === "group" ? thread.name : thread.peer?.username || "Chat 1-1"; }
function avatarInitial(value) {
  return [...String(value || "H").trim()][0]?.toLocaleUpperCase("vi-VN") || "H";
}
function threadTimestamp(thread) {
  return new Date(thread.last_message?.created_at || thread.created_at || 0).getTime();
}
function compactTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}
function threadPreview(thread) {
  if (!thread.last_message) return thread.kind === "group" ? `${thread.member_count} thành viên` : "Bắt đầu trò chuyện";
  if (thread.last_message.recalled_at) return "Tin nhắn đã được thu hồi";
  if (thread.kind === "direct") return "Tin nhắn được mã hóa đầu cuối";
  return thread.last_message.content || "Tin nhắn mới";
}
function directThreadForPeer(peerID) {
  return [...state.threads.values()].find((cache) => cache.summary?.kind === "direct" &&
    cache.summary.peer?.id === peerID);
}
function renderPeerList() {
  directThreadList.replaceChildren();
  groupThreadList.replaceChildren();
  const query = state.conversationSearch.toLocaleLowerCase("vi-VN");
  const caches = [...state.threads.values()].filter((cache) => {
    const thread = cache.summary;
    if (!thread) return false;
    if (state.conversationFilter === "group" && thread.kind !== "group") return false;
    if (state.conversationFilter === "unread" && Number(thread.unread_count || 0) < 1) return false;
    return !query || threadTitle(thread).toLocaleLowerCase("vi-VN").includes(query) ||
      (thread.kind === "group" && threadPreview(thread).toLocaleLowerCase("vi-VN").includes(query));
  }).sort((left, right) => threadTimestamp(right.summary) - threadTimestamp(left.summary));
  for (const cache of caches) {
    const thread = cache.summary;
    const button = document.createElement("button");
    button.type = "button";
    const unread = cache.active ? Number(thread.unread_count || 0) : 0;
    button.className = `conversation-item${thread.id === state.threadID ? " active" : ""}${unread ? " unread" : ""}`;
    const avatar = document.createElement("span"); avatar.className = `avatar ${thread.kind === "group" ? "avatar-group" : ""}`; avatar.textContent = avatarInitial(threadTitle(thread));
    const copy = document.createElement("span"); copy.className = "conversation-copy";
    const top = document.createElement("span"); top.className = "conversation-top";
    const name = document.createElement("strong"); name.textContent = threadTitle(thread);
    const time = document.createElement("time"); time.textContent = compactTime(thread.last_message?.created_at || thread.created_at);
    const preview = document.createElement("span"); preview.className = "conversation-preview"; preview.textContent = cache.active ? threadPreview(thread) : "Bạn đã rời nhóm · Xem lịch sử";
    top.append(name, time); copy.append(top, preview); button.append(avatar, copy);
    if (unread > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.setAttribute("aria-label", `${unread} tin chưa đọc`);
      button.append(badge);
    }
    button.addEventListener("click", () => openThread(thread.id));
    directThreadList.append(button);
  }
  if (!directThreadList.children.length) {
    const empty = document.createElement("p");
    empty.className = "conversation-list-empty";
    empty.textContent = query || state.conversationFilter !== "all" ? "Không tìm thấy cuộc trò chuyện phù hợp." : "Chưa có cuộc trò chuyện nào.";
    directThreadList.append(empty);
  }
  peerList.replaceChildren();
  const newPeers = state.users.filter((user) => user.id !== state.currentUserID && !directThreadForPeer(user.id));
  newDirectSection.hidden = newPeers.length === 0;
  for (const user of newPeers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "person-option";
    button.dataset.name = user.username.toLocaleLowerCase("vi-VN");
    const avatar = document.createElement("span"); avatar.className = "avatar"; avatar.textContent = avatarInitial(user.username);
    const label = document.createElement("span"); label.textContent = user.username;
    button.append(avatar, label);
    button.disabled = !state.e2ee?.canRead();
    button.addEventListener("click", () => openDirect(user.id));
    peerList.append(button);
  }
}
async function loadUsers() {
  if (state.usersRequest) return state.usersRequest.promise;
  const sessionVersion = state.sessionVersion, token = state.token;
  const request = {};
  state.usersRequest = request;
  refreshUsersButton.disabled = true;
  request.promise = (async () => {
    try {
      const users = await apiRequest("/users");
      if (!currentSessionMatches(sessionVersion, token)) return;
      const me = users.find((user) => user.id === state.currentUserID);
      if (!me) { clearSession(); throw new Error("Tài khoản không còn tồn tại."); }
      const selected = new Set([...groupUsers.querySelectorAll('input:checked')].map((input) => input.value));
      state.users = users;
      state.currentUsername = me.username;
      currentUsername.textContent = me.username;
      groupUsers.replaceChildren();
      for (const user of users.filter((user) => user.id !== state.currentUserID)) {
        const label = document.createElement("label");
        label.dataset.name = user.username.toLocaleLowerCase("vi-VN");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox"; checkbox.value = user.id; checkbox.checked = selected.has(user.id);
        const name = document.createElement("span"); name.textContent = user.username;
        label.append(checkbox, name); groupUsers.append(label);
      }
      renderSelectedMembers();
      renderPeerList();
      if (state.currentCache) renderMembers(state.currentCache);
    } finally {
      if (state.usersRequest === request) {
        state.usersRequest = null;
        refreshUsersButton.disabled = false;
      }
    }
  })();
  return request.promise;
}
function receivedMessage(message) {
  return message.sender_id !== state.currentUserID;
}
function reconcileThreadSummary(thread) {
  const cache = cacheForThread(thread.id);
  const old = cache.summary;
  const rejoined = old && thread.kind === "group" && Number(old.joined_seq) !== Number(thread.joined_seq);
  if (rejoined) {
    cache.membershipEpoch += 1;
    cache.lastReadSeq = Number(thread.last_read_seq || 0);
    cache.pendingReadSeq = 0;
    cache.readRequest = null;
    cache.members = null;
    cache.membersDirty = true;
  } else if (cache.lastReadSeq > Number(thread.last_read_seq || 0)) {
    // An older summary cannot undo a PUT that already completed.
    if (cache.lastReadSeq < Number(thread.last_seq || 0)) {
      scheduleThreadSummaryRefresh();
      return cache;
    }
    thread.unread_count = 0;
  }
  cache.lastReadSeq = Math.max(cache.lastReadSeq, Number(thread.last_read_seq || 0));
  thread.last_read_seq = cache.lastReadSeq;
  cache.peerLastReadSeq = thread.kind === "direct"
    ? Math.max(cache.peerLastReadSeq, Number(thread.peer_last_read_seq || 0)) : 0;
  cache.summaryBaseSeq = Number(thread.last_seq || 0);
  for (const [seq, message] of cache.eventMessages) {
    if (seq <= cache.summaryBaseSeq) cache.eventMessages.delete(seq);
    else {
      thread.last_seq = Math.max(Number(thread.last_seq || 0), seq);
      if (receivedMessage(message) && seq > cache.lastReadSeq) thread.unread_count += 1;
    }
  }
  cache.summary = thread;
  cache.active = true;
  cache.permissionsPending = false;
  processE2EEMessages(cache);
  return cache;
}
function deactivateGroup(cache) {
  if (cache.active) cache.membershipEpoch += 1;
  cache.active = false;
  cache.permissionsPending = false;
  cache.pendingReadSeq = 0;
  cache.members = null;
  if (cache.summary) cache.summary.unread_count = 0;
}
function updateThreadFromMessage(message) {
  const cache = cacheForThread(message.thread_id);
  const recalledAt = cache.recalls.get(message.id || message.message_id);
  if (recalledAt) message = { ...message, content: "", recalled_at: recalledAt };
  if (!cache.summary || (message.content_format === "e2ee_v2" && cache.summary.kind !== "direct")) {
    scheduleThreadSummaryRefresh();
  }
  const seq = Number(message.seq);
  if (!Number.isSafeInteger(seq) || seq <= 0 || seq <= cache.summaryBaseSeq || cache.eventMessages.has(seq)) return;
  cache.eventMessages.set(seq, message);
  const thread = cache.summary;
  if (!thread) scheduleThreadSummaryRefresh();
  else {
    thread.last_seq = Math.max(Number(thread.last_seq || 0), seq);
    if (!thread.last_message || seq >= Number(thread.last_message.seq || 0)) {
      thread.last_message = { seq, sender_id: message.sender_id, content: message.content,
        recalled_at: message.recalled_at || null, created_at: message.created_at };
    }
    if (cache.active && receivedMessage(message) && seq > cache.lastReadSeq) thread.unread_count += 1;
  }
  if (message.kind === "system") {
    state.membershipSerial += 1;
    cache.permissionsPending = true;
    cache.membersDirty = true;
    if (state.threadListRequest) state.threadListDirty = true;
    scheduleThreadSummaryRefresh();
    if (state.currentCache === cache) renderThreadHeading();
  }
  renderPeerList();
}
function acceptMessage(message) {
  const cache = cacheForThread(message.thread_id);
  let changed;
  try { changed = mergeMessages(cache, [message]); }
  catch { return { cache, changed: false, conflict: true }; }
  if (cache.messagesLoaded && changed) {
    const seq = Number(message.seq);
    if (seq > cache.syncedSeq + 1) void catchUpConversation(cache, seq);
    else while (cache.messages.has(cache.syncedSeq + 1)) cache.syncedSeq += 1;
  }
  return { cache, changed };
}
function scheduleThreadSummaryRefresh() {
  if (state.threadSummaryTimer !== null) return;
  const sessionVersion = state.sessionVersion, token = state.token;
  state.threadSummaryTimer = setTimeout(() => {
    state.threadSummaryTimer = null;
    if (currentSessionMatches(sessionVersion, token)) void loadThreads();
  }, threadSummaryDebounceMs);
}
async function loadThreads(catchUpCached = false) {
  if (!state.token) return;
  state.threadListCatchup ||= catchUpCached;
  if (state.threadSummaryTimer !== null) clearTimeout(state.threadSummaryTimer);
  state.threadSummaryTimer = null;
  if (state.threadListRequest) {
    state.threadListDirty = true;
    return state.threadListRequest.promise;
  }
  const sessionVersion = state.sessionVersion, token = state.token;
  const request = {};
  state.threadListRequest = request;
  request.promise = (async () => {
    try {
      do {
        state.threadListDirty = false;
        const serial = state.membershipSerial;
        const readSerial = state.readSerial;
        const threads = await apiRequest("/threads");
        if (!currentSessionMatches(sessionVersion, token)) return;
        // Membership/read changes after GET began invalidate its permissions/counts.
        if (serial !== state.membershipSerial || readSerial !== state.readSerial) {
          state.threadListDirty = true;
          continue;
        }
        const activeIDs = new Set(threads.map((thread) => thread.id));
        for (const thread of threads) {
          const cache = reconcileThreadSummary(thread);
          if (cache.messagesLoaded && (state.threadListCatchup || cache.syncedSeq < Number(thread.last_seq))) {
            void catchUpConversation(cache, Number(thread.last_seq));
          }
        }
        for (const cache of state.threads.values()) {
          if (cache.summary?.kind === "group" && !activeIDs.has(cache.threadID)) {
            const wasActive = cache.active;
            deactivateGroup(cache);
            // Also recover the removal/leave notice if it happened while offline.
            if (wasActive && cache.messagesLoaded) void catchUpConversation(cache);
          }
        }
        renderPeerList();
        renderThreadHeading();
        const cache = state.currentCache;
        if (cache?.messagesLoaded) renderMessages("preserve");
        if (cache?.summary?.kind === "group" && cache.active && !membersPanel.hidden && cache.membersDirty) {
          void loadMembers(cache);
        }
        state.threadListCatchup = false;
      } while (state.threadListDirty && currentSessionMatches(sessionVersion, token));
    } catch (error) {
      if (currentSessionMatches(sessionVersion, token)) showError(error);
    } finally {
      if (state.threadListRequest === request) state.threadListRequest = null;
    }
  })();
  return request.promise;
}

function displayName(userID) {
  if (userID === state.currentUserID) {
    return state.currentUsername;
  }
  return peerByID(userID)?.username || "Người dùng";
}

function mergeMessages(cache, messages) {
  try {
    const mergeable = [];
    for (const raw of messages) {
      const message = { ...raw };
      const id = message.id || message.message_id;
      if (message.thread_id !== cache.threadID || [...state.threads.values()].some((other) =>
        other !== cache && other.messageIDs.has(id))) {
        throw new Error("UUID message xuất hiện với thread khác; giữ nguyên nội dung và khóa đã lưu.");
      }
      const recalledAt = message.recalled_at || cache.recalls.get(id);
      if (recalledAt) {
        cache.recalls.set(id, recalledAt);
        message.recalled_at = recalledAt;
        message.content = "";
        const existingSeq = cache.messageIDs.get(id);
        const existing = existingSeq === undefined ? null : cache.messages.get(existingSeq);
        if (existing) {
          existing.recalled_at = recalledAt;
          existing.content = "";
          cache.decryptedViews.delete(id);
          continue;
        }
      }
      mergeable.push(message);
    }
    const changed = MiniHermesRealtime.merge(cache.messages, cache.messageIDs, mergeable);
    processE2EEMessages(cache);
    return changed;
  } catch (error) {
    cache.payloadConflict = true;
    if (state.currentCache === cache) {
      showError(error);
      renderMessages("preserve");
    }
    throw error;
  }
}

function processE2EEMessages(cache, retryErrors = false) {
  const client = state.e2ee;
  for (const message of cache.messages.values()) {
    if (message.kind !== "text") continue;
    if (message.recalled_at || cache.recalls.has(message.id)) {
      cache.decryptedViews.delete(message.id);
      continue;
    }
    if (message.content_format !== "e2ee_v2" && cache.summary?.kind !== "direct") continue;
    if (!cache.summary?.peer?.id) {
      cache.decryptedViews.set(message.id, { status: "pending" });
      scheduleThreadSummaryRefresh();
      continue;
    }
    if (!client?.canRead()) {
      cache.decryptedViews.set(message.id, { status: "pending" });
      continue;
    }
    if (cache.payloadConflict || cache.decryptJobs.has(message.id)) continue;
    const previous = cache.decryptedViews.get(message.id);
    if (previous?.status === "ready" || (previous?.status === "error" && !retryErrors)) continue;
    const snapshot = cacheSnapshot(cache);
    cache.decryptedViews.set(message.id, { status: "pending" });
    const job = client.receive(cache.summary, message).then((view) => {
      if (!membershipSnapshotMatches(snapshot) || state.e2ee !== client || cache.payloadConflict || cache.recalls.has(message.id)) return;
      cache.decryptedViews.set(message.id, view);
      if (state.currentCache === cache && cache.messagesLoaded) renderMessages("new");
    }).catch(() => {
      if (membershipSnapshotMatches(snapshot) && state.e2ee === client) {
        cache.decryptedViews.set(message.id, { status: "error", error: "Không thể khôi phục khóa hoặc giải mã tin nhắn. Hãy thử lại." });
        if (state.currentCache === cache && cache.messagesLoaded) renderMessages("preserve");
      }
    }).finally(() => { if (cache.decryptJobs.get(message.id) === job) cache.decryptJobs.delete(message.id); });
    cache.decryptJobs.set(message.id, job);
  }
}

function sortedMessages(cache) {
  return [...cache.messages.values()].sort((left, right) => left.seq - right.seq);
}

function highestMessageSeq(cache) {
  let highest = 0;
  for (const seq of cache.messages.keys()) {
    highest = Math.max(highest, seq);
  }
  return highest;
}

function atConversationBottom() {
  return historyElement.scrollHeight - historyElement.scrollTop - historyElement.clientHeight <= historyBottomTolerance;
}

async function downloadAndDecryptAttachment(descriptor) {
  const token = state.token, sessionVersion = state.sessionVersion;
  const response = await fetch(`/attachments/${encodeURIComponent(descriptor.attachmentId)}/content`, {
    headers: { Authorization: `Bearer ${token}` }, signal: state.sessionAbort.signal,
  });
  if (response.status === 401 && currentSessionMatches(sessionVersion, token)) {
    clearSession();
    if (typeof location.replace === "function") location.replace("/login");
    throw new Error("Phiên đăng nhập đã hết hạn.");
  }
  if (!response.ok) throw new Error(response.status === 403 ? "Bạn không có quyền tải tệp này." : "Không tải được tệp đính kèm.");
  const ciphertext = await response.arrayBuffer();
  if (ciphertext.byteLength !== descriptor.sizeBytes + 16) throw new Error("Kích thước tệp mã hóa không hợp lệ.");
  const key = await crypto.subtle.importKey("raw", base64ToBytes(descriptor.key), { name: "AES-GCM" }, false, ["decrypt"]);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(descriptor.iv), tagLength: 128 }, key, ciphertext);
  } catch {
    throw new Error("Không thể giải mã tệp; dữ liệu hoặc khóa không hợp lệ.");
  }
  if (plaintext.byteLength !== descriptor.sizeBytes) throw new Error("Tệp giải mã không đúng kích thước.");
  return new Blob([plaintext], { type: descriptor.mimeType });
}

function attachmentCard(descriptor) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "attachment-card";
  button.setAttribute("aria-label", `Mở tệp ${descriptor.name}, ${formatBytes(descriptor.sizeBytes)}`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5");
  svg.append(path); button.append(svg);
  const copy = document.createElement("span");
  const name = document.createElement("strong"); name.textContent = descriptor.name;
  const size = document.createElement("small"); size.textContent = `${formatBytes(descriptor.sizeBytes)} · Nhấn để mở`;
  copy.append(name, size); button.append(copy);
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true; size.textContent = `${formatBytes(descriptor.sizeBytes)} · Đang giải mã…`;
    try {
      const blob = await downloadAndDecryptAttachment(descriptor);
      const url = URL.createObjectURL(blob); attachmentObjectURLs.add(url);
      if (previewImageTypes.has(descriptor.mimeType)) {
        const image = document.createElement("img");
        image.className = "attachment-image"; image.src = url; image.alt = descriptor.name;
        button.replaceWith(image);
      } else {
        const link = document.createElement("a"); link.href = url; link.download = descriptor.name;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => { URL.revokeObjectURL(url); attachmentObjectURLs.delete(url); }, 1000);
        button.disabled = false; size.textContent = `${formatBytes(descriptor.sizeBytes)} · Đã tải xuống`;
      }
    } catch (error) {
      button.disabled = false; size.textContent = `${formatBytes(descriptor.sizeBytes)} · Thử lại`;
      showError(error instanceof Error ? error.message : "Không mở được tệp đính kèm.");
    }
  });
  return button;
}

function voiceMessageCard(descriptor, durationMs) {
  const wrapper = document.createElement("div");
  wrapper.className = "voice-message";
  const audio = document.createElement("audio");
  audio.preload = "none";
  const play = document.createElement("button"); play.type = "button"; play.className = "voice-icon-button voice-play";
  play.setAttribute("aria-label", "Phát tin nhắn thoại"); play.append(voiceIcon("m9 6 9 6-9 6Z"));
  const progress = document.createElement("input"); progress.className = "voice-progress"; progress.type = "range"; progress.min = "0"; progress.max = "1000"; progress.value = "0"; progress.setAttribute("aria-label", "Tiến trình tin nhắn thoại");
  const label = document.createElement("small");
  label.textContent = formatDuration(durationMs);
  const speed = document.createElement("button"); speed.type = "button"; speed.className = "voice-speed"; speed.textContent = "1×"; speed.setAttribute("aria-label", "Tốc độ phát 1 lần");
  wrapper.append(audio, play, progress, label, speed);
  let loaded = false;
  const loadAndPlay = async () => {
    for (const other of document.querySelectorAll(".voice-message audio")) {
      if (other !== audio) other.pause();
    }
    if (loaded) { await audio.play(); return; }
    label.textContent = "Đang tải…";
    try {
      const blob = await downloadAndDecryptAttachment(descriptor);
      const url = URL.createObjectURL(blob);
      attachmentObjectURLs.add(url);
      audio.src = url;
      loaded = true;
      label.textContent = formatDuration(durationMs);
      await audio.play();
    } catch (error) {
      label.textContent = "Thử lại";
      showError(error instanceof Error ? error.message : "Không thể phát tin nhắn thoại.");
    }
  };
  play.addEventListener("click", () => { if (audio.paused) void loadAndPlay(); else audio.pause(); });
  audio.addEventListener("play", () => { play.replaceChildren(voiceIcon("M8 6v12M16 6v12")); play.setAttribute("aria-label", "Dừng tin nhắn thoại"); });
  audio.addEventListener("pause", () => { play.replaceChildren(voiceIcon("m9 6 9 6-9 6Z")); play.setAttribute("aria-label", "Phát tin nhắn thoại"); });
  audio.addEventListener("timeupdate", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    progress.value = String(Math.round(audio.currentTime / audio.duration * 1000));
  });
  progress.addEventListener("input", () => { if (Number.isFinite(audio.duration)) audio.currentTime = Number(progress.value) / 1000 * audio.duration; });
  speed.addEventListener("click", () => {
    const next = audio.playbackRate === 1 ? 1.5 : audio.playbackRate === 1.5 ? 2 : 1;
    audio.playbackRate = next; speed.textContent = `${String(next).replace(".", ",")}×`; speed.setAttribute("aria-label", `Tốc độ phát ${next} lần`);
  });
  return wrapper;
}

function applyRecall(change, render = true) {
  const messageID = change.message_id || change.id;
  const threadID = change.thread_id;
  if (!messageID || !threadID || !change.recalled_at) return;
  const cache = cacheForThread(threadID);
  cache.recalls.set(messageID, change.recalled_at);
  const seq = cache.messageIDs.get(messageID);
  const message = seq === undefined ? null : cache.messages.get(seq);
  if (message) {
    message.recalled_at = change.recalled_at;
    message.content = "";
    cache.decryptedViews.delete(messageID);
  }
  if (cache.summary?.last_message && message && Number(cache.summary.last_message.seq) === Number(message.seq)) {
    cache.summary.last_message.content = "";
    cache.summary.last_message.recalled_at = change.recalled_at;
  }
  const changeSeq = Number(change.change_seq || 0);
  if (Number.isSafeInteger(changeSeq)) state.recallCursor = Math.max(state.recallCursor, changeSeq);
  revokeAttachmentURLs();
  renderPeerList();
  if (render && state.currentCache === cache && cache.messagesLoaded) renderMessages("preserve");
  if (!message || !cache.summary) scheduleThreadSummaryRefresh();
}

async function recallMessage(message, button) {
  if (!message?.id || message.sender_id !== state.currentUserID || message.recalled_at) return;
  if (!window.confirm("Thu hồi tin nhắn này? Nội dung và tệp đính kèm sẽ không còn truy cập được.")) return;
  button.disabled = true;
  try {
    const result = await apiRequest(`/messages/${encodeURIComponent(message.id)}/recall`, { method: "POST" });
    applyRecall(result);
  } catch (error) {
    button.disabled = false;
    showError(error);
  }
}

async function syncRecallChanges() {
  if (!state.token) return;
  if (state.recallSyncRequest) return state.recallSyncRequest;
  const version = state.sessionVersion, token = state.token;
  const request = (async () => {
    try {
      while (currentSessionMatches(version, token)) {
        const page = await apiRequest(`/message-changes?after=${state.recallCursor}`);
        const changes = Array.isArray(page.changes) ? page.changes : [];
        for (const change of changes) applyRecall(change, false);
        const previousCursor = state.recallCursor;
        const next = Number(page.next_cursor || previousCursor);
        if (Number.isSafeInteger(next)) state.recallCursor = Math.max(previousCursor, next);
        if (changes.length < 100 || state.recallCursor <= previousCursor) break;
      }
      if (state.currentCache?.messagesLoaded) renderMessages("preserve");
    } catch (error) {
      if (currentSessionMatches(version, token)) showError(error);
    } finally {
      if (state.recallSyncRequest === request) state.recallSyncRequest = null;
    }
  })();
  state.recallSyncRequest = request;
  return request;
}

function renderMessages(scrollMode = "preserve") {
  const cache = state.currentCache;
  if (!cache) return;
  const previousHeight = historyElement.scrollHeight;
  const previousTop = historyElement.scrollTop;
  const wasAtBottom = atConversationBottom();
  const messages = sortedMessages(cache);

  historyElement.replaceChildren();
  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Chưa có tin nhắn nào.";
    historyElement.append(empty);
  } else {
    let previousDate = "", previousSender = "", previousKind = "";
    const lastReadableSent = [...messages].reverse().find((message) => message.kind === "text" && message.sender_id === state.currentUserID);
    for (const message of messages) {
      const sent = message.sender_id === state.currentUserID;
      const created = new Date(message.created_at);
      const dateKey = created.toLocaleDateString("vi-VN");
      if (dateKey !== previousDate) {
        const divider = document.createElement("div");
        divider.className = "date-divider";
        divider.textContent = created.toDateString() === new Date().toDateString() ? "Hôm nay" : dateKey;
        historyElement.append(divider);
        previousDate = dateKey; previousSender = ""; previousKind = "";
      }
      const item = document.createElement("article");
      item.className = `message ${message.kind === "system" ? "system" : sent ? "sent" : "received"}`;
      if (message.kind === "text" && previousKind === "text" && previousSender === message.sender_id) item.classList.add("continued");
      item.dataset.seq = String(message.seq);
      item.dataset.kind = message.kind;

      const content = document.createElement("p");
      const recalled = Boolean(message.recalled_at || cache.recalls.has(message.id));
      const encrypted = !recalled && message.kind === "text" && (message.content_format === "e2ee_v2" || cache.summary?.kind === "direct");
      const view = cache.decryptedViews.get(message.id);
      const cryptoState = !encrypted ? "plaintext" : cache.payloadConflict ? "error"
        : state.e2ee?.canRead() ? view?.status || "pending" : "pending";
      item.dataset.cryptoState = cryptoState;
      if (encrypted) item.classList.add(cryptoState === "error" ? "crypto-error" : cryptoState === "ready" ? "crypto-ready" : "crypto-pending");
      const decryptedContent = recalled ? (sent ? "Bạn đã thu hồi một tin nhắn" : "Tin nhắn đã được thu hồi") : !encrypted ? message.content : cryptoState === "ready" ? view.plaintext
        : cryptoState === "error" ? "Không thể đọc tin nhắn. Hãy thử lại."
        : "Đang tải tin nhắn...";
      const attachmentMessage = message.kind === "text" && (!encrypted || cryptoState === "ready")
        ? parseAttachmentMessage(decryptedContent) : null;
      const renderedContent = attachmentMessage ? attachmentMessage.text : decryptedContent;
      content.textContent = renderedContent;
      if (recalled) item.classList.add("recalled");
      if (message.kind === "text" && (!encrypted || cryptoState === "ready") && isEmojiOnly(renderedContent)) {
        content.classList.add("emoji-message");
        if ((scrollMode === "new" || scrollMode === "bottom") && !cache.animatedMessageIDs.has(message.id)) {
          content.classList.add("emoji-message-new");
        }
      }
      cache.animatedMessageIDs.add(message.id);

      const meta = document.createElement("small");
      const time = created.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      const readStatus = cache.summary?.kind === "direct" && sent && message === lastReadableSent && message.seq <= cache.peerLastReadSeq ? " · Đã xem" : "";
      meta.textContent = `${time}${readStatus}`;
      if (cache.summary?.kind === "group" && !sent && message.kind === "text" &&
          (previousSender !== message.sender_id || previousKind !== "text")) {
        const sender = document.createElement("strong"); sender.className = "message-sender"; sender.textContent = displayName(message.sender_id); item.append(sender);
      }
      item.append(content);
      if (attachmentMessage) for (const attachment of attachmentMessage.attachments) {
        item.append(attachmentMessage.type === "voice" ? voiceMessageCard(attachment, attachmentMessage.durationMs) : attachmentCard(attachment));
      }
      item.append(meta);
      if (sent && message.kind === "text" && !recalled) {
        const menu = document.createElement("details"); menu.className = "message-menu";
        const summary = document.createElement("summary"); summary.textContent = "⋯"; summary.setAttribute("aria-label", "Tùy chọn tin nhắn");
        const recall = document.createElement("button"); recall.type = "button"; recall.textContent = "Thu hồi";
        recall.addEventListener("click", () => void recallMessage(message, recall));
        menu.append(summary, recall); item.append(menu);
      }
      historyElement.append(item);
      if (encrypted && cryptoState === "ready") view.rendered = true;
      previousSender = message.sender_id; previousKind = message.kind;
    }
  }

  if (scrollMode === "initial" || scrollMode === "bottom" || (scrollMode === "new" && wasAtBottom)) {
    historyElement.scrollTop = historyElement.scrollHeight;
  } else if (scrollMode === "older") {
    historyElement.scrollTop = previousTop + historyElement.scrollHeight - previousHeight;
  } else {
    historyElement.scrollTop = previousTop;
  }
  newMessagesButton.hidden = !(scrollMode === "new" && !wasAtBottom);
  loadOlderButton.hidden = cache.nextCursor === null;
  loadOlderButton.disabled = !cache.messagesLoaded || cache.nextCursor === null || Boolean(cache.olderRequest);
  renderThreadHeading();
  scheduleReadMarker();
}

function pageURL(threadID, beforeSeq = null) {
  const params = new URLSearchParams({ limit: String(messagePageLimit) });
  if (beforeSeq !== null) {
    params.set("before_seq", String(beforeSeq));
  }
  return `/threads/${threadID}/messages?${params}`;
}

async function loadInitialHistory(cache = state.currentCache) {
  if (!cache || !state.token || cache.messagesLoaded) return;
  if (cache.initialHistoryRequest) return cache.initialHistoryRequest.promise;
  const snapshot = cacheSnapshot(cache);
  // A read marker is a conservative boundary, not proof of a synced cache.
  const baseline = Math.max(0, Number(cache.summary?.last_read_seq || 0));
  const request = {};
  cache.initialHistoryRequest = request;
  request.promise = (async () => {
    try {
      const maxSeq = await MiniHermesRealtime.fetchThroughBoundary(
        async (beforeSeq) => {
          const page = await apiRequest(pageURL(snapshot.threadID, beforeSeq));
          if (!membershipSnapshotMatches(snapshot)) throw new Error("session or membership changed");
          return page;
        }, baseline,
        (messages, page) => {
          mergeMessages(cache, messages);
          cache.nextCursor = page.next_cursor ?? null;
        },
      );
      if (!membershipSnapshotMatches(snapshot)) return;
      cache.syncedSeq = maxSeq;
      cache.messagesLoaded = true;
      if (state.currentCache === cache) renderMessages("initial");
      const target = Math.max(highestMessageSeq(cache), Number(cache.summary?.last_seq || 0));
      if (target > cache.syncedSeq) await catchUpConversation(cache, target);
    } catch (error) {
      if (membershipSnapshotMatches(snapshot) && state.currentCache === cache) showError(error);
    } finally {
      if (cache.initialHistoryRequest === request) cache.initialHistoryRequest = null;
    }
  })();
  return request.promise;
}

async function catchUpConversation(cache = state.currentCache, targetSeq = 0) {
  if (!cache || state.threads.get(cache.threadID) !== cache || !cache.messagesLoaded || !state.token) return;
  if (cache.catchupRequest) {
    cache.catchupTargetSeq = Math.max(cache.catchupTargetSeq, targetSeq);
    return cache.catchupRequest.promise;
  }
  const snapshot = cacheSnapshot(cache);
  const request = {};
  cache.catchupRequest = request;
  request.promise = (async () => {
    const baseline = cache.syncedSeq;
    let completed = false;
    try {
      const maxSeq = await MiniHermesRealtime.fetchThroughBoundary(
        async (beforeSeq) => {
          const page = await apiRequest(pageURL(snapshot.threadID, beforeSeq));
          if (!membershipSnapshotMatches(snapshot)) throw new Error("session or membership changed");
          return page;
        }, baseline,
        (messages) => mergeMessages(cache, messages),
      );
      if (!membershipSnapshotMatches(snapshot)) return;
      cache.syncedSeq = Math.max(cache.syncedSeq, maxSeq);
      completed = true;
      if (state.currentCache === cache) renderMessages("new");
    } catch (error) {
      if (membershipSnapshotMatches(snapshot) && state.currentCache === cache) showError(error);
    } finally {
      if (cache.catchupRequest !== request) return;
      cache.catchupRequest = null;
      const nextTarget = cache.catchupTargetSeq;
      cache.catchupTargetSeq = 0;
      // Only a newer event received during this fetch can cause one more pass.
      // The same inaccessible target must never keep a group in a sync loop.
      if (completed && nextTarget > cache.syncedSeq && nextTarget > targetSeq && membershipSnapshotMatches(snapshot)) {
        void catchUpConversation(cache, nextTarget);
      }
    }
  })();
  return request.promise;
}

async function syncCurrentConversation() {
  const cache = state.currentCache;
  if (!cache) {
    return;
  }
  if (!cache.messagesLoaded) {
    await loadInitialHistory(cache);
  } else {
    await catchUpConversation(cache);
  }
}

function stopWebSocket(resetBackoff = true) {
  state.socketGeneration += 1;
  state.socketTicketAbort?.abort();
  state.socketTicketAbort = null;
  clearSocketHealthTimer();
  if (state.reconnectTimer !== null) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  const socket = state.socket;
  state.socket = null;
  state.socketConnecting = false;
  state.socketLastActivityAt = 0;
  if (resetBackoff) {
    state.reconnectDelay = 1000;
    state.socketSummaryStale = false;
  }
  if (socket) {
    socket.close(1000, "session ended");
  }
}

function clearSocketHealthTimer() {
  if (state.socketHealthTimer !== null) {
    clearTimeout(state.socketHealthTimer);
    state.socketHealthTimer = null;
  }
}

function armSocketTimeout(generation, sessionVersion, token, delay) {
  clearSocketHealthTimer();
  const timer = setTimeout(() => {
    if (state.socketHealthTimer !== timer) {
      return;
    }
    state.socketHealthTimer = null;
    if (generation === state.socketGeneration && currentSessionMatches(sessionVersion, token) &&
        !(document.visibilityState === "hidden" && state.socket?.readyState === WebSocket.OPEN)) {
      restartWebSocket();
    }
  }, delay);
  state.socketHealthTimer = timer;
}

function restartWebSocket(immediate = false) {
  if (!state.token) {
    return;
  }
  stopWebSocket(false);
  state.socketSummaryStale = true;
  if (immediate) {
    void connectWebSocket();
  } else {
    scheduleReconnect(state.socketGeneration, state.sessionVersion, state.token);
  }
}

function ensureWebSocket() {
  if (!state.token || (state.socketConnecting && !state.socket)) {
    return;
  }
  if (!state.socket) {
    if (state.reconnectTimer !== null) {
      return;
    }
    void connectWebSocket();
    return;
  }
  if (state.socket.readyState === 0 && state.socketConnecting) {
    return;
  }
  if (state.socket.readyState === WebSocket.OPEN) {
    // Background tabs can delay both timers and onmessage callbacks. Give a queued
    // heartbeat a chance to arrive before declaring an apparently open socket dead.
    const stale = Date.now() - state.socketLastActivityAt >= websocketHeartbeatTimeoutMs;
    armSocketTimeout(state.socketGeneration, state.sessionVersion, state.token,
      stale ? websocketResumeGraceMs : websocketHeartbeatTimeoutMs);
  } else {
    restartWebSocket();
  }
}

function scheduleReconnect(generation, sessionVersion, token) {
  if (generation !== state.socketGeneration || !currentSessionMatches(sessionVersion, token) ||
      state.reconnectTimer !== null) {
    return;
  }
  const delay = state.reconnectDelay;
  state.reconnectDelay = Math.min(delay * 2, 30000);
  const timer = setTimeout(() => {
    if (state.reconnectTimer !== timer) {
      return;
    }
    state.reconnectTimer = null;
    if (generation === state.socketGeneration && currentSessionMatches(sessionVersion, token)) {
      void connectWebSocket();
    }
  }, delay);
  state.reconnectTimer = timer;
}

function handleSocketMessage(data) {
  let event;
  try {
    event = JSON.parse(data);
  } catch {
    return;
  }
  if (!event || typeof event !== "object") return;
  if (event.type?.startsWith("call.")) {
    window.MiniHermesCalls?.handleEvent(event);
    if (event.type === "call.ended") {
      const cache = state.threads.get(event.thread_id);
      if (cache?.messagesLoaded) void catchUpConversation(cache);
      scheduleThreadSummaryRefresh();
    }
    return;
  }
  if (event.type?.startsWith("group-call.")) {
    window.MiniHermesGroupCalls?.handleEvent(event);
    if (event.type === "group-call.ended") {
      const cache = state.threads.get(event.thread_id);
      if (cache?.messagesLoaded) void catchUpConversation(cache);
      scheduleThreadSummaryRefresh();
    }
    return;
  }
  if (event.type === "message.recalled") {
    if (event.recipient_id === state.currentUserID) applyRecall(event);
    return;
  }
  if (event.type === "thread.updated") {
    if (event.recipient_id === state.currentUserID &&
        [event.thread_id, event.recipient_id].every((id) => typeof id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) &&
          id !== "00000000-0000-0000-0000-000000000000")) {
      scheduleThreadSummaryRefresh();
    }
    return;
  }
  const seq = Number(event.seq);
  if (event.type !== "message.created" || event.recipient_id !== state.currentUserID ||
      typeof event.message_id !== "string" || typeof event.thread_id !== "string" ||
      !Number.isSafeInteger(seq) || seq <= 0) {
    return;
  }
  const { cache, changed, conflict } = acceptMessage(event);
  if (!conflict) updateThreadFromMessage(event);
  if (state.currentCache === cache) renderThreadHeading();
  if (state.currentCache === cache && cache.messagesLoaded && changed) {
    renderMessages("new");
  }
}

async function connectWebSocket() {
  if (!state.token || state.socket || state.socketConnecting) {
    return;
  }
  const sessionVersion = state.sessionVersion;
  const token = state.token;
  const generation = state.socketGeneration;
  const ticketAbort = new AbortController();
  state.socketTicketAbort = ticketAbort;
  state.socketConnecting = true;
  armSocketTimeout(generation, sessionVersion, token, websocketConnectTimeoutMs);
  try {
    const response = await apiRequest("/auth/ws-ticket", { method: "POST", signal: ticketAbort.signal });
    if (state.socketTicketAbort === ticketAbort) {
      state.socketTicketAbort = null;
    }
    if (generation !== state.socketGeneration || !currentSessionMatches(sessionVersion, token)) {
      return;
    }
    const url = new URL(response.ws_url);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      throw new Error("Địa chỉ WebSocket không hợp lệ.");
    }
    url.searchParams.set("ticket", response.ticket);
    const socket = new WebSocket(url.toString());
    state.socket = socket;
    socket.onopen = () => {
      if (generation !== state.socketGeneration || state.socket !== socket) {
        socket.close();
        return;
      }
      state.socketConnecting = false;
      state.socketLastActivityAt = Date.now();
      if (document.visibilityState === "visible") {
        armSocketTimeout(generation, sessionVersion, token, websocketHeartbeatTimeoutMs);
      } else {
        clearSocketHealthTimer();
      }
      showError("");
      void window.MiniHermesCalls?.reconcile();
      void window.MiniHermesGroupCalls?.reconcile();
      void syncRecallChanges();
      if (state.socketSummaryStale) {
        state.socketSummaryStale = false;
        void loadThreads(true);
        if (state.currentCache && !state.currentCache.messagesLoaded) {
          void loadInitialHistory(state.currentCache);
        }
      } else {
        // The first socket may open after the initial REST page was fetched.
        void syncCurrentConversation();
      }
      void flushReadMarker();
    };
    socket.onmessage = (message) => {
      if (generation === state.socketGeneration && state.socket === socket) {
        state.socketLastActivityAt = Date.now();
        if (document.visibilityState === "visible") {
          armSocketTimeout(generation, sessionVersion, token, websocketHeartbeatTimeoutMs);
        } else {
          clearSocketHealthTimer();
        }
        state.reconnectDelay = 1000;
        handleSocketMessage(message.data);
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (generation !== state.socketGeneration || state.socket !== socket) {
        return;
      }
      clearSocketHealthTimer();
      state.socket = null;
      state.socketConnecting = false;
      state.socketSummaryStale = true;
      scheduleReconnect(generation, sessionVersion, token);
    };
  } catch (error) {
    if (state.socketTicketAbort === ticketAbort) {
      state.socketTicketAbort = null;
    }
    if (generation === state.socketGeneration && currentSessionMatches(sessionVersion, token)) {
      clearSocketHealthTimer();
      state.socketConnecting = false;
      state.socketSummaryStale = true;
      showError(error);
      scheduleReconnect(generation, sessionVersion, token);
    }
  }
}

async function loadOlderMessages() {
  const cache = state.currentCache;
  if (!cache?.messagesLoaded || cache.nextCursor === null || cache.olderRequest) {
    return;
  }
  const snapshot = cacheSnapshot(cache);
  const request = { ...snapshot, beforeSeq: cache.nextCursor };
  cache.olderRequest = request;
  loadOlderButton.disabled = true;

  try {
    const page = await apiRequest(pageURL(snapshot.threadID, request.beforeSeq));
    if (!membershipSnapshotMatches(snapshot)) {
      return;
    }
    mergeMessages(cache, Array.isArray(page.messages) ? page.messages : []);
    cache.nextCursor = page.next_cursor ?? null;
    if (state.currentCache === cache) {
      renderMessages("older");
      showError("");
    }
  } catch (error) {
    if (membershipSnapshotMatches(snapshot) && state.currentCache === cache) {
      showError(error);
    }
  } finally {
    if (cache.olderRequest === request) {
      cache.olderRequest = null;
      if (state.currentCache === cache) {
        loadOlderButton.hidden = cache.nextCursor === null;
        loadOlderButton.disabled = cache.nextCursor === null;
      }
    }
  }
}

function renderedReadSequence(snapshot) {
  const cache = snapshot.cache;
  if (
    !currentConversationMatches(snapshot) ||
    !membershipSnapshotMatches(snapshot) ||
    document.visibilityState !== "visible" ||
    chatView.hidden ||
    !cache.messagesLoaded || !canUseThread(cache) || cache.payloadConflict || !atConversationBottom()
  ) {
    return 0;
  }
  if (cache.summary.kind === "direct") {
    if (!state.e2ee?.canRead()) return 0;
    // System and recalled messages are already safely rendered as local UI text.
    // Only a visible direct text ciphertext must finish decrypting before its
    // sequence can advance the read marker.
    for (const message of cache.messages.values()) {
      if (message.kind !== "text" || message.recalled_at || cache.recalls.has(message.id)) continue;
      const view = cache.decryptedViews.get(message.id);
      if (message.content_format !== "e2ee_v2" || view?.status !== "ready" || !view.rendered) return 0;
    }
  } else if (!canSendPlaintext(cache)) return 0;
  const latest = historyElement.querySelector(".message:last-child");
  if (!latest) return 0;
  const historyRect = historyElement.getBoundingClientRect();
  const messageRect = latest.getBoundingClientRect();
  const visibleTop = Math.max(0, historyRect.top);
  const visibleBottom = Math.min(window.innerHeight, historyRect.bottom);
  if (messageRect.bottom <= visibleTop || messageRect.top >= visibleBottom ||
      messageRect.bottom > visibleBottom + historyBottomTolerance ||
      messageRect.right <= 0 || messageRect.left >= window.innerWidth) return 0;
  const seq = Number(latest.dataset.seq);
  return Number.isSafeInteger(seq) && seq <= cache.syncedSeq && seq >= Number(cache.summary.joined_seq || 1) ? seq : 0;
}

function markConversationRead(snapshot = conversationSnapshot()) {
  const seq = renderedReadSequence(snapshot);
  if (seq <= (snapshot.cache?.lastReadSeq || 0)) return;
  snapshot.cache.pendingReadSeq = Math.max(snapshot.cache.pendingReadSeq, seq);
  void flushReadMarker(snapshot);
}

function scheduleReadMarker() {
  if (state.readFrame !== null) cancelAnimationFrame(state.readFrame);
  const snapshot = conversationSnapshot();
  state.readFrame = requestAnimationFrame(() => {
    state.readFrame = null;
    markConversationRead(snapshot);
  });
}

async function sendE2EEFromForm() {
  const cache = state.currentCache, client = state.e2ee;
  if (!canSendE2EE(cache) || cache.e2eeSending) return;
  const snapshot = conversationSnapshot();
  const content = contentInput.value;
  const file = selectedAttachmentFile;
  if (!content.trim() && !file) { showError("Hãy nhập tin nhắn hoặc chọn một tệp."); return; }
  cache.draftContent = content;
  cache.e2eeSending = true;
  updateSendButton();
  showError("");
  try {
    let plaintext = content, attachmentIDs = [];
    if (file) {
      let prepared = cache.preparedAttachment;
      if (!prepared || prepared.file !== file || prepared.text !== content) {
        const encrypted = await encryptAttachment(file);
        const form = new FormData();
        form.append("file", encrypted.blob, "attachment.bin");
        const uploaded = await apiRequest(`/threads/${encodeURIComponent(cache.threadID)}/attachments`, { method: "POST", body: form });
        encrypted.descriptor.attachmentId = uploaded.attachmentId;
        plaintext = JSON.stringify({ version: 1, type: "attachment", text: content.trim(), attachments: [encrypted.descriptor] });
        if ([...plaintext].length > 1000) throw new Error("Tên tệp hoặc nội dung quá dài để gửi an toàn.");
        prepared = { file, text: content, plaintext, attachmentIDs: [uploaded.attachmentId] };
        cache.preparedAttachment = prepared;
      }
      plaintext = prepared.plaintext;
      attachmentIDs = prepared.attachmentIDs;
    }
    const message = await client.send(structuredClone(cache.summary), plaintext, attachmentIDs);
    if (!membershipSnapshotMatches(snapshot) || state.e2ee !== client) return;
    const accepted = acceptMessage(message);
    if (!accepted.conflict) updateThreadFromMessage(message);
    if (cache.draftContent === content) cache.draftContent = "";
    cache.preparedAttachment = null;
    if (state.currentCache === cache) {
      if (contentInput.value === content) contentInput.value = "";
      if (selectedAttachmentFile === file) clearSelectedAttachment();
      renderMessages(currentConversationMatches(snapshot) ? "bottom" : "new");
    }
  } catch (error) {
    if (membershipSnapshotMatches(snapshot) && state.currentCache === cache && state.e2ee === client) {
      showError(`${errorMessage(error)} Dùng Gửi lại trong danh sách tin chưa xác nhận.`);
    }
  } finally {
    cache.e2eeSending = false;
    if (state.e2ee === client) renderE2EEPanel();
    if (state.currentCache === cache) updateSendButton();
  }
}

async function sendVoiceDraft() {
  const cache = state.currentCache, client = state.e2ee, draft = voiceDraft;
  if (!draft || !canSendE2EE(cache) || cache.e2eeSending) return;
  const snapshot = conversationSnapshot();
  cache.e2eeSending = true;
  updateSendButton();
  showError("");
  try {
    let prepared = draft.prepared;
    if (!prepared) {
      const encrypted = await encryptAttachment(draft.file);
      const form = new FormData();
      form.append("file", encrypted.blob, "voice-message.bin");
      const uploaded = await apiRequest(`/threads/${encodeURIComponent(cache.threadID)}/attachments`, { method: "POST", body: form });
      encrypted.descriptor.attachmentId = uploaded.attachmentId;
      const plaintext = JSON.stringify({ version: 1, type: "voice", text: "", durationMs: Math.round(draft.durationMs), attachments: [encrypted.descriptor] });
      if ([...plaintext].length > 1000) throw new Error("Thông tin tin nhắn thoại quá dài để gửi an toàn.");
      prepared = { plaintext, attachmentIDs: [uploaded.attachmentId] };
      draft.prepared = prepared;
    }
    const message = await client.send(structuredClone(cache.summary), prepared.plaintext, prepared.attachmentIDs);
    if (!membershipSnapshotMatches(snapshot) || state.e2ee !== client) return;
    const accepted = acceptMessage(message);
    if (!accepted.conflict) updateThreadFromMessage(message);
    if (voiceDraft === draft) clearVoiceDraft();
    if (state.currentCache === cache) renderMessages(currentConversationMatches(snapshot) ? "bottom" : "new");
  } catch (error) {
    if (membershipSnapshotMatches(snapshot) && state.currentCache === cache && state.e2ee === client) {
      showError(`${errorMessage(error)} Bản ghi vẫn được giữ để bạn thử gửi lại.`);
    }
  } finally {
    cache.e2eeSending = false;
    if (state.e2ee === client) renderE2EEPanel();
    if (state.currentCache === cache) updateSendButton();
  }
}

async function runE2EEAction(work) {
  const client = state.e2ee;
  if (!client) return;
  const sessionVersion = state.sessionVersion, token = state.token;
  showError("");
  try { await work(client); }
  catch (error) { if (currentSessionMatches(sessionVersion, token)) showError(error); }
  finally {
    if (currentSessionMatches(sessionVersion, token) && state.e2ee === client) {
      renderE2EEPanel();
      renderThreadHeading();
      for (const cache of state.threads.values()) processE2EEMessages(cache);
    }
  }
}

async function retryE2EE(client, messageID) {
  const message = await client.retry(messageID);
  if (state.e2ee !== client || !state.token) return;
  const accepted = acceptMessage(message);
  if (!accepted.conflict) updateThreadFromMessage(message);
  if (state.currentCache === accepted.cache) renderMessages("new");
}

e2eeDecryptRetry.addEventListener("click", () => {
  if (state.currentCache) processE2EEMessages(state.currentCache, true);
});

async function flushReadMarker(snapshot = conversationSnapshot()) {
  const cache = snapshot.cache;
  const renderedSeq = renderedReadSequence(snapshot);
  if (!renderedSeq || cache.readRequest || cache.pendingReadSeq <= cache.lastReadSeq) {
    return;
  }

  const target = Math.min(cache.pendingReadSeq, renderedSeq);
  if (target <= cache.lastReadSeq) return;
  cache.pendingReadSeq = 0;
  const request = { ...snapshot, target };
  let completed = false;
  cache.readRequest = request;
  try {
    const response = await apiRequest(`/threads/${snapshot.threadID}/read`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_read_seq: target }),
    });
    if (!membershipSnapshotMatches(snapshot) || !canUseThread(cache)) return;

    const previousReadSeq = cache.lastReadSeq;
    cache.lastReadSeq = Math.max(cache.lastReadSeq, Number(response.last_read_seq || 0));
    if (cache.lastReadSeq > previousReadSeq) {
      state.readSerial += 1;
      cache.summary.last_read_seq = cache.lastReadSeq;
      const lastSeq = Number(cache.summary.last_seq);
      const lastSeqKnown = cache.summary.last_seq != null && Number.isSafeInteger(lastSeq) && lastSeq >= 0;
      if (lastSeqKnown && cache.lastReadSeq >= lastSeq) cache.summary.unread_count = 0;
      renderPeerList();
      // Existing GETs must not restore a marker from before this PUT.
      if (state.threadListRequest) state.threadListDirty = true;
      // Decide from the state AFTER the PUT, including events received in flight.
      // PostgreSQL recounts remaining/unknown unread, including unloaded pages.
      const unread = Number(cache.summary.unread_count);
      const unreadKnown = cache.summary.unread_count != null && Number.isSafeInteger(unread) && unread >= 0;
      if (!lastSeqKnown || !unreadKnown || unread > 0 || cache.lastReadSeq > target) void loadThreads();
    }
    completed = true;
  } catch (error) {
    if (membershipSnapshotMatches(snapshot) && canUseThread(cache)) {
      // PUT may have committed despite a lost response; retrying a monotonic marker is safe.
      cache.pendingReadSeq = Math.max(cache.pendingReadSeq, target);
    }
    if (cacheSnapshotMatches(snapshot) && error.status === 403) void loadThreads();
    if (currentConversationMatches(snapshot)) showError(error);
  } finally {
    if (cache.readRequest === request) {
      cache.readRequest = null;
    }
    if (completed && membershipSnapshotMatches(snapshot) && currentConversationMatches(snapshot)) {
      markConversationRead(snapshot);
    } else if (completed && membershipSnapshotMatches(snapshot) && state.currentCache === cache) {
      markConversationRead();
    }
  }
}

async function openThread(threadID) {
  const cache = state.threads.get(threadID);
  if (!cache?.summary) return;
  if (state.currentCache) state.currentCache.draftContent = contentInput.value;
  if (state.threadID !== threadID) {
    clearSelectedAttachment();
    revokeAttachmentURLs();
  }
  state.conversationVersion += 1;
  state.threadID = threadID;
  state.currentCache = cache;
  chatView.hidden = false;
  contentInput.value = cache.draftContent;
  membersPanel.hidden = true;
  if (composeDialog.open) composeDialog.close();
  renderPeerList();
  renderThreadHeading();
  showError("");
  if (cache.messagesLoaded) renderMessages("initial");
  else {
    historyElement.replaceChildren();
    loadOlderButton.hidden = true;
    await loadInitialHistory(cache);
  }
  if (state.currentCache === cache) {
    void window.MiniHermesGroupCalls?.observeThread(cache.summary, state.currentUserID);
    void flushReadMarker();
    if (canUseThread(cache)) contentInput.focus();
  }
}

async function openDirect(peerID) {
  const cached = directThreadForPeer(peerID);
  if (cached) return openThread(cached.threadID);
  if (!state.e2ee?.canRead()) {
    showError("Đang chuẩn bị cuộc trò chuyện. Vui lòng đợi một chút.");
    return;
  }
  if (state.currentCache) state.currentCache.draftContent = contentInput.value;
  const version = ++state.conversationVersion;
  const sessionVersion = state.sessionVersion, token = state.token;
  state.currentCache = null;
  state.threadID = "";
  renderThreadHeading();
  try {
    let request = state.directRequestsByPeer.get(peerID);
    if (!request) {
      request = apiRequest("/threads/direct", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peer_id: peerID }) });
      state.directRequestsByPeer.set(peerID, request);
      void request.finally(() => {
        if (state.directRequestsByPeer.get(peerID) === request) state.directRequestsByPeer.delete(peerID);
      }).catch(() => {});
    }
    const thread = await request;
    if (!currentSessionMatches(sessionVersion, token)) return;
    reconcileThreadSummary(thread);
    renderPeerList();
    if (composeDialog.open) composeDialog.close();
    if (version === state.conversationVersion) await openThread(thread.id);
  } catch (error) {
    if (version === state.conversationVersion && currentSessionMatches(sessionVersion, token)) showError(error);
  }
}

function renderMembers(cache) {
  if (state.currentCache !== cache || membersPanel.hidden) return;
  memberList.replaceChildren();
  const admin = canUseThread(cache) && cache.summary.role === "admin";
  for (const member of cache.members || []) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${member.username} · ${member.role === "admin" ? "Quản trị viên" : "Thành viên"}`;
    item.append(label);
    if (admin && member.id !== state.currentUserID) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Xóa";
      remove.disabled = Boolean(cache.memberMutation);
      remove.addEventListener("click", () => changeMembership(cache, "remove", member.id));
      item.append(remove);
    }
    memberList.append(item);
  }
  addMemberForm.hidden = !admin;
  const selected = addMemberUser.value;
  addMemberUser.replaceChildren();
  const memberIDs = new Set((cache.members || []).map((member) => member.id));
  for (const user of state.users.filter((user) => !memberIDs.has(user.id))) {
    const option = document.createElement("option");
    option.value = user.id; option.textContent = user.username;
    addMemberUser.append(option);
  }
  if ([...addMemberUser.options].some((option) => option.value === selected)) addMemberUser.value = selected;
  addMemberButton.disabled = !admin || !cache.members || !addMemberUser.options.length || Boolean(cache.memberMutation);
  leaveButton.disabled = !canUseThread(cache) || Boolean(cache.memberMutation);
}
function renderConversationInfo(cache = state.currentCache) {
  if (!cache?.summary || membersPanel.hidden) return;
  const thread = cache.summary;
  const title = threadTitle(thread);
  infoAvatar.textContent = avatarInitial(title);
  infoTitle.textContent = title;
  infoDescription.textContent = thread.kind === "group"
    ? `${thread.member_count} thành viên · ${thread.role === "admin" ? "Bạn là quản trị viên" : "Bạn là thành viên"}`
    : "Cuộc trò chuyện được mã hóa đầu cuối";
  groupManagement.hidden = thread.kind !== "group";
  if (thread.kind === "group") renderMembers(cache);
}
async function loadMembers(cache = state.currentCache) {
  if (!cache?.active || cache.summary?.kind !== "group") return;
  if (cache.membersRequest) return cache.membersRequest;
  const snapshot = cacheSnapshot(cache), serial = state.membershipSerial;
  const request = (async () => {
    try {
      const members = await apiRequest(`/threads/${cache.threadID}/members`);
      if (!membershipSnapshotMatches(snapshot) || !cache.active || serial !== state.membershipSerial) return;
      cache.members = members;
      cache.membersDirty = false;
      renderMembers(cache);
    } catch (error) {
      if (!cacheSnapshotMatches(snapshot)) return;
      if (error.status === 403) void loadThreads();
      if (state.currentCache === cache) showError(error);
    } finally {
      if (cache.membersRequest === request) cache.membersRequest = null;
      if (cacheSnapshotMatches(snapshot) && cache.active && cache.membersDirty &&
          (serial !== state.membershipSerial || !membershipSnapshotMatches(snapshot)) &&
          state.currentCache === cache && !membersPanel.hidden) {
        void loadMembers(cache);
      }
    }
  })();
  cache.membersRequest = request;
  return request;
}
async function changeMembership(cache, action, userID = "") {
  if (!canUseThread(cache) || cache.memberMutation || (action !== "leave" && cache.summary.role !== "admin")) return;
  const snapshot = cacheSnapshot(cache);
  const request = {};
  cache.memberMutation = request;
  renderMembers(cache);
  const path = action === "leave" ? `/threads/${cache.threadID}/leave`
    : `/threads/${cache.threadID}/members${action === "remove" ? `/${userID}` : ""}`;
  try {
    const message = await apiRequest(path, { method: action === "remove" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(action === "add" ? { body: JSON.stringify({ user_id: userID }) } : {}) });
    if (!cacheSnapshotMatches(snapshot)) return;
    const accepted = acceptMessage(message);
    if (!accepted.conflict) updateThreadFromMessage(message);
    if (state.currentCache === cache) renderMessages("new");
  } catch (error) {
    if (!cacheSnapshotMatches(snapshot)) return;
    if (error.status === 503 && error.details?.thread_id) {
      showNotice("Thay đổi đã được lưu. Đang cập nhật nhóm...");
      void catchUpConversation(cache, Number(error.details.seq || 0));
    } else if (state.currentCache === cache) showError(error);
  } finally {
    if (cache.memberMutation === request) cache.memberMutation = null;
    if (cacheSnapshotMatches(snapshot)) {
      state.membershipSerial += 1;
      cache.permissionsPending = true;
      cache.membersDirty = true;
      state.threadListDirty = true;
      if (state.currentCache === cache) { renderThreadHeading(); renderMembers(cache); }
      await loadThreads();
      if (cacheSnapshotMatches(snapshot) && cache.active && state.currentCache === cache && !membersPanel.hidden) await loadMembers(cache);
    }
  }
}
async function recoverCreatedGroup(creation) {
  const sessionVersion = state.sessionVersion, token = state.token;
  await loadThreads();
  if (!currentSessionMatches(sessionVersion, token) || state.groupCreation !== creation) return;
  if (creation.threadID && state.threads.get(creation.threadID)?.active) {
    state.groupCreation = null;
    createGroupButton.disabled = false;
    recoverGroupButton.hidden = true;
    groupForm.reset();
    if (creation.conversationVersion === state.conversationVersion) await openThread(creation.threadID);
    if (currentSessionMatches(sessionVersion, token)) showNotice("Đã mở nhóm.");
  } else {
    showNotice(creation.threadID
      ? "Nhóm đã được lưu. Bấm Mở lại nhóm đã tạo để thử lại."
      : "Chưa xác nhận kết quả tạo nhóm. Hãy kiểm tra danh sách nhóm trước khi tải lại trang và tạo nhóm khác.");
    recoverGroupButton.hidden = false;
  }
}

function openComposeDialog(mode = "direct") {
  setComposeMode(mode);
  if (!composeDialog.open) composeDialog.showModal();
  requestAnimationFrame(() => (mode === "group" ? groupForm.elements.name : peopleSearch).focus());
}
function setComposeMode(mode) {
  const group = mode === "group";
  directTab.setAttribute("aria-selected", String(!group));
  groupTab.setAttribute("aria-selected", String(group));
  directComposePanel.hidden = group;
  groupForm.hidden = !group;
}
function renderSelectedMembers() {
  selectedMembers.replaceChildren();
  for (const checkbox of groupUsers.querySelectorAll('input:checked')) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "member-chip";
    chip.textContent = `${checkbox.nextElementSibling?.textContent || "Thành viên"} ×`;
    chip.setAttribute("aria-label", `Bỏ chọn ${checkbox.nextElementSibling?.textContent || "thành viên"}`);
    chip.addEventListener("click", () => { checkbox.checked = false; renderSelectedMembers(); });
    selectedMembers.append(chip);
  }
}

newConversationButton.addEventListener("click", () => openComposeDialog("direct"));
emptyNewConversation.addEventListener("click", () => openComposeDialog("direct"));
closeComposeDialog.addEventListener("click", () => composeDialog.close());
directTab.addEventListener("click", () => setComposeMode("direct"));
groupTab.addEventListener("click", () => setComposeMode("group"));
composeDialog.addEventListener("click", (event) => {
  if (event.target === composeDialog) composeDialog.close();
});
conversationSearch.addEventListener("input", () => {
  state.conversationSearch = conversationSearch.value.trim();
  renderPeerList();
});
conversationFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.conversationFilter = button.dataset.filter;
  for (const item of conversationFilters.querySelectorAll("button")) {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  }
  renderPeerList();
});
peopleSearch.addEventListener("input", () => {
  const query = peopleSearch.value.trim().toLocaleLowerCase("vi-VN");
  for (const option of peerList.querySelectorAll(".person-option")) option.hidden = Boolean(query) && !option.dataset.name.includes(query);
});
groupUserSearch.addEventListener("input", () => {
  const query = groupUserSearch.value.trim().toLocaleLowerCase("vi-VN");
  for (const option of groupUsers.querySelectorAll("label")) option.hidden = Boolean(query) && !option.dataset.name.includes(query);
});
groupUsers.addEventListener("change", renderSelectedMembers);
closeInfoButton.addEventListener("click", () => { membersPanel.hidden = true; });
callButton.addEventListener("click", () => window.MiniHermesGroupCalls?.start(state.currentCache?.summary, "audio", state.currentUserID));
videoCallButton.addEventListener("click", () => window.MiniHermesGroupCalls?.start(state.currentCache?.summary, "video", state.currentUserID));
moreButton.addEventListener("click", () => showNotice("Các thao tác bổ sung sẽ xuất hiện tại đây khi được hỗ trợ."));
newMessagesButton.addEventListener("click", () => {
  historyElement.scrollTop = historyElement.scrollHeight;
  newMessagesButton.hidden = true;
  scheduleReadMarker();
});
backToListButton.addEventListener("click", () => {
  membersPanel.hidden = true;
  chatView.hidden = true;
});

groupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.groupCreation || !state.token) return;
  const sessionVersion = state.sessionVersion, token = state.token;
  const creation = { threadID: "", conversationVersion: state.conversationVersion };
  state.groupCreation = creation;
  createGroupButton.disabled = true;
  showError(""); showNotice("");
  const memberIDs = [...groupUsers.querySelectorAll("input:checked")].map((input) => input.value);
  try {
    const thread = await apiRequest("/threads/group", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: groupForm.elements.name.value, member_ids: memberIDs }) });
    if (!currentSessionMatches(sessionVersion, token)) return;
    state.membershipSerial += 1;
    reconcileThreadSummary(thread);
    state.groupCreation = null;
    createGroupButton.disabled = false;
    groupForm.reset();
    renderSelectedMembers();
    renderPeerList();
    if (composeDialog.open) composeDialog.close();
    if (creation.conversationVersion === state.conversationVersion) await openThread(thread.id);
  } catch (error) {
    if (!currentSessionMatches(sessionVersion, token)) return;
    if (error.status === undefined || error.status >= 500) {
      creation.threadID = error.details?.thread_id || "";
      state.membershipSerial += 1;
      state.threadListDirty = true;
      await recoverCreatedGroup(creation);
    } else {
      state.groupCreation = null;
      createGroupButton.disabled = false;
      showError(error);
    }
  }
});
recoverGroupButton.addEventListener("click", () => {
  if (state.groupCreation) {
    state.groupCreation.conversationVersion = state.conversationVersion;
    void recoverCreatedGroup(state.groupCreation);
  }
});
membersButton.addEventListener("click", () => {
  const cache = state.currentCache;
  if (!cache?.active) return;
  membersPanel.hidden = !membersPanel.hidden;
  if (!membersPanel.hidden) {
    renderConversationInfo(cache);
    if (cache.summary?.kind === "group" && (!cache.members || cache.membersDirty)) void loadMembers(cache);
  }
});
addMemberForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.currentCache && addMemberUser.value) void changeMembership(state.currentCache, "add", addMemberUser.value);
});
leaveButton.addEventListener("click", () => {
  if (state.currentCache) void changeMembership(state.currentCache, "leave");
});

function setAuthBusy(busy) {
  state.authBusy = busy;
  registerButton.disabled = busy;
  loginButton.disabled = busy;
}
function readSessionValue(key) {
  try { return sessionStorage.getItem(key) || ""; } catch (_) { return ""; }
}
function cacheSession() {
  try {
    sessionStorage.setItem(sessionTokenKey, state.token);
    sessionStorage.setItem(sessionUsernameKey, state.currentUsername);
    sessionStorage.setItem(sessionVaultKey, state.vaultKey);
    sessionStorage.setItem(sessionVaultUserKey, state.currentUserID);
  } catch (_) { /* A fresh login can always restore account and epoch keys from the server. */ }
}
async function restoreAuthenticatedSession() {
  const version = state.sessionVersion, token = state.token;
  await loadUsers();
  if (!currentSessionMatches(version, token)) return;
  await startE2EE();
  if (!currentSessionMatches(version, token)) return;
  cacheSession();
  showChatView();
  showNotice("");
  await loadThreads();
  if (currentSessionMatches(version, token)) void connectWebSocket();
}
async function finishLogin(username, credential, expectedVersion) {
  const response = await apiRequest("/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, auth_credential: credential.auth_credential }),
  }, false);
  if (expectedVersion !== state.sessionVersion) return;
  const userID = decodeSubject(response.access_token);
  if (!userID || response.user_id !== userID || !MiniHermesE2EEClient.validKey(credential.vault_key)) {
    throw new Error("Thông tin đăng nhập không hợp lệ.");
  }
  clearSession();
  state.token = response.access_token;
  state.currentUserID = userID;
  state.currentUsername = username;
  state.vaultKey = credential.vault_key;
  const version = state.sessionVersion, token = state.token;
  try { await restoreAuthenticatedSession(); }
  catch (error) {
    if (currentSessionMatches(version, token)) {
      clearSession();
      showError(error);
    }
  }
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.authBusy) return;
  const version = state.sessionVersion;
  const username = MiniHermesE2EEClient.normalizeUsername(registerForm.elements.username.value);
  const password = registerForm.elements.password.value;
  setAuthBusy(true);
  showError(""); showNotice("Đang tạo tài khoản...");
  try {
    const account = await MiniHermesE2EEClient.createAccount(username, password);
    if (version !== state.sessionVersion) return;
    await apiRequest("/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, auth_credential: account.auth_credential, kdf: account.kdf,
        public_bundle: account.public_bundle, account_vault: account.account_vault }),
    }, false);
    if (version !== state.sessionVersion) return;
    registerForm.reset();
    loginForm.elements.username.value = username;
    showNotice("Tài khoản đã được tạo. Đang đăng nhập...");
    await finishLogin(username, account, version);
  } catch (error) {
    if (version === state.sessionVersion) showError(error);
  } finally {
    registerForm.elements.password.value = "";
    setAuthBusy(false);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.authBusy) return;
  const version = state.sessionVersion;
  const username = MiniHermesE2EEClient.normalizeUsername(loginForm.elements.username.value);
  const password = loginForm.elements.password.value;
  setAuthBusy(true);
  showError(""); showNotice("Đang đăng nhập...");
  try {
    const params = await apiRequest("/auth/params?username=" + encodeURIComponent(username), {}, false);
    if (version !== state.sessionVersion) return;
    if (params.username !== username) throw new Error("Hồ sơ đăng nhập không khớp tài khoản.");
    const credential = await MiniHermesE2EEClient.deriveCredentials(username, password, params.kdf);
    if (version !== state.sessionVersion) return;
    await finishLogin(username, credential, version);
    if (state.currentUsername === username && state.e2ee?.canRead()) loginForm.reset();
  } catch (error) {
    if (version === state.sessionVersion) showError(error);
  } finally {
    loginForm.elements.password.value = "";
    setAuthBusy(false);
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.currentCache?.summary?.kind === "direct") {
    await sendE2EEFromForm();
    return;
  }
  if (!canSendPlaintext(state.currentCache)) {
    if (!state.currentCache?.summary) scheduleThreadSummaryRefresh();
    return;
  }
  const snapshot = conversationSnapshot();
  const cache = snapshot.cache;
  if (cache.pendingSend?.inFlight) {
    return;
  }
  const content = contentInput.value;
  let pending = cache.pendingSend;
  if (pending && content !== pending.content) {
    showError(pendingSendMismatchMessage);
    return;
  }
  if (!pending) {
    if (!validGroupContent(content)) {
      showError(groupContentValidationMessage);
      return;
    }
    pending = { messageID: crypto.randomUUID(), content, inFlight: false };
    cache.pendingSend = pending;
  }
  cache.draftContent = content;
  pending.inFlight = true;
  updateSendButton();
  showError("");
  try {
    const message = await sendMessageWithRetry(snapshot, pending.messageID, pending.content);
    if (!cacheSnapshotMatches(snapshot)) {
      return;
    }
    if (cache.pendingSend === pending) {
      cache.pendingSend = null;
    }
    if (cache.draftContent === pending.content) {
      cache.draftContent = "";
    }
    const accepted = acceptMessage(message);
    if (!accepted.conflict) updateThreadFromMessage(message);
    if (state.currentCache === cache) {
      if (contentInput.value === pending.content) {
        contentInput.value = "";
      } else {
        cache.draftContent = contentInput.value;
        showNotice("Tin trước đã gửi; nội dung đã sửa vẫn ở ô nhập. Bấm Gửi để gửi thành tin mới.");
      }
      renderMessages(currentConversationMatches(snapshot) ? "bottom" : "new");
    }
  } catch (error) {
    if (!cacheSnapshotMatches(snapshot)) return;
    const rejected = error.status === 400 || error.status === 413;
    if (rejected && cache.pendingSend === pending) cache.pendingSend = null;
    if (cacheSnapshotMatches(snapshot) && error.status === 403) void loadThreads();
    if (cacheSnapshotMatches(snapshot) && state.currentCache === cache) {
      showError(rejected ? errorMessage(error) : contentInput.value === pending.content
        ? `${errorMessage(error)} Tin chưa được xác nhận; bấm Gửi lại với nội dung cũ.`
        : pendingSendMismatchMessage);
    }
  } finally {
    pending.inFlight = false;
    if (cacheSnapshotMatches(snapshot) && state.currentCache === cache) {
      updateSendButton();
    }
  }
});

contentInput.addEventListener("input", () => {
  if (contentInput.style) {
    contentInput.style.height = "auto";
    contentInput.style.height = `${Math.min(contentInput.scrollHeight, 144)}px`;
  }
  const cache = state.currentCache;
  if (!cache) return;
  cache.draftContent = contentInput.value;
  if (cache.pendingSend && contentInput.value !== cache.pendingSend.content) {
    showError(pendingSendMismatchMessage);
  } else if (errorElement.textContent === pendingSendMismatchMessage) {
    showError("");
  } else if (errorElement.textContent === groupContentValidationMessage && validGroupContent(contentInput.value)) {
    showError("");
  }
  updateSendButton();
});
contentInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!sendButton.disabled) messageForm.requestSubmit();
  }
});

for (const emoji of emojis) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = emoji;
  button.setAttribute("aria-label", `Chèn ${emoji}`);
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    contentInput.setRangeText(emoji, contentInput.selectionStart, contentInput.selectionEnd, "end");
    contentInput.dispatchEvent(new Event("input", { bubbles: true }));
    closeEmojiPicker({ restoreFocus: true });
  });
  emojiPicker.append(button);
}
emojiToggle.addEventListener("click", () => {
  const opening = emojiPicker.hidden;
  emojiPicker.hidden = !opening;
  emojiToggle.setAttribute("aria-expanded", String(opening));
  if (opening) emojiPicker.querySelector("button")?.focus();
});
document.addEventListener("click", (event) => {
  if (!emojiWrapper.contains(event.target)) closeEmojiPicker();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !emojiPicker.hidden) {
    event.preventDefault();
    closeEmojiPicker({ restoreFocus: true });
  }
});

attachmentButton.addEventListener("click", () => {
  if (state.currentCache?.summary?.kind !== "direct") {
    showNotice("Tệp mã hóa đầu cuối hiện chỉ hỗ trợ chat cá nhân; chat nhóm chưa có E2EE.");
    return;
  }
  attachmentInput.click();
});
attachmentInput.addEventListener("change", () => {
  const file = attachmentInput.files?.[0] || null;
  if (!file) { clearSelectedAttachment(); return; }
  if (file.size <= 0 || file.size > maximumAttachmentBytes) {
    clearSelectedAttachment();
    showError(file.size <= 0 ? "Tệp phải lớn hơn 0 byte." : "Tệp không được vượt quá 20 MiB.");
    return;
  }
  selectedAttachmentFile = file;
  attachmentName.textContent = safeAttachmentName(file.name);
  attachmentSize.textContent = `${formatBytes(file.size)} · Sẽ mã hóa trước khi tải lên`;
  attachmentDraft.hidden = false;
  showError("");
  updateSendButton();
  contentInput.focus();
});
removeAttachmentButton.addEventListener("click", () => {
  clearSelectedAttachment();
  updateSendButton();
  contentInput.focus();
});

voiceRecordButton.addEventListener("click", () => {
  if (state.currentCache?.summary?.kind !== "direct") {
    showNotice("Tin nhắn thoại mã hóa đầu cuối hiện chỉ hỗ trợ chat cá nhân.");
    return;
  }
  if (!voiceRecorder) initializeVoiceRecorder();
  if (!voiceRecorder) { showError("Không thể khởi tạo chức năng ghi âm."); return; }
  void voiceRecorder.start();
});
voiceStopButton.addEventListener("click", () => voiceRecorder?.stop());
voiceCancelButton.addEventListener("click", () => voiceRecorder?.cancel());
voiceDiscardButton.addEventListener("click", () => clearVoiceDraft());
voiceSendButton.addEventListener("click", () => void sendVoiceDraft());
window.addEventListener("pagehide", () => {
  if (voiceRecorder && voiceState !== "idle") voiceRecorder.cancel();
  clearVoiceDraft();
});

refreshUsersButton.addEventListener("click", async () => {
  if (!state.token || state.usersRequest) return;
  const sessionVersion = state.sessionVersion, token = state.token;
  try {
    await loadUsers();
  } catch (error) {
    if (currentSessionMatches(sessionVersion, token)) showError(error);
  }
});

logoutButton.addEventListener("click", () => {
  clearSession();
  if (typeof location.assign === "function") location.assign("/login?logged_out=1");
});

loadOlderButton.addEventListener("click", loadOlderMessages);

historyElement.addEventListener("scroll", () => {
  scheduleReadMarker();
  if (atConversationBottom()) newMessagesButton.hidden = true;
});
window.addEventListener("scroll", scheduleReadMarker);
window.addEventListener("resize", scheduleReadMarker);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") {
    if (state.socket?.readyState === WebSocket.OPEN) {
      clearSocketHealthTimer();
    }
    return;
  }
  if (!state.token) {
    return;
  }
  const snapshot = conversationSnapshot();
  markConversationRead(snapshot);
  void flushReadMarker(snapshot);
  ensureWebSocket();
});

window.addEventListener("online", () => {
  if (!state.token) {
    return;
  }
  ensureWebSocket();
});

state.token = readSessionValue(sessionTokenKey);
state.currentUserID = decodeSubject(state.token);
state.currentUsername = readSessionValue(sessionUsernameKey);
state.vaultKey = readSessionValue(sessionVaultKey);
if (state.token && state.currentUserID === readSessionValue(sessionVaultUserKey) &&
    MiniHermesE2EEClient.validKey(state.vaultKey)) {
  state.sessionVersion += 1;
  const version = state.sessionVersion, token = state.token;
  setAuthBusy(true);
  showNotice("Đang khôi phục phiên đăng nhập...");
  void restoreAuthenticatedSession().catch((error) => {
    if (currentSessionMatches(version, token)) { clearSession(); showError(error); }
  }).finally(() => setAuthBusy(false));
} else {
  clearSession();
  if (location.pathname === "/app" && typeof location.replace === "function") location.replace("/login");
}
