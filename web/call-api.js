(function () {
  const tokenKey = "mini-hermes.access-token";
  const groupDeviceKey = "mini-hermes.group-call-device";
  function groupDeviceID() { let value = sessionStorage.getItem(groupDeviceKey); if (!value) { value = crypto.randomUUID(); sessionStorage.setItem(groupDeviceKey, value); } return value; }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${sessionStorage.getItem(tokenKey) || ""}`);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...options, headers });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.error || "Không thể thực hiện cuộc gọi."); error.status = response.status; throw error; }
    return body;
  }
  window.MiniHermesCallAPI = {
    create: (threadID, mediaType) => request(`/threads/${threadID}/calls`, { method: "POST", body: JSON.stringify({ mediaType, clientRequestId: crypto.randomUUID() }) }),
    get: (id) => request(`/calls/${id}`),
    accept: (id) => request(`/calls/${id}/accept`, { method: "POST" }),
    reject: (id) => request(`/calls/${id}/reject`, { method: "POST" }),
    end: (id, reason = "") => request(`/calls/${id}/end`, { method: "POST", body: JSON.stringify({ reason }) }),
    connected: (id) => request(`/calls/${id}/connected`, { method: "POST" }),
    ice: (id) => request(`/calls/${id}/ice-config`),
    signal: (id, type, payload) => request(`/calls/${id}/signal`, { method: "POST", body: JSON.stringify({ type, payload }) }),
    groupCreate: (threadID, mediaType) => request(`/threads/${threadID}/group-calls`, { method: "POST", body: JSON.stringify({ mediaType }) }),
    groupActive: (threadID) => request(`/threads/${threadID}/group-calls/active`),
    groupGet: (id) => request(`/group-calls/${id}`),
    groupJoin: (id) => request(`/group-calls/${id}/join`, { method: "POST", headers: { "X-Device-ID": groupDeviceID() } }),
    groupReady: (id, sessionId) => request(`/group-calls/${id}/ready`, { method: "POST", headers: { "X-Device-ID": groupDeviceID() }, body: JSON.stringify({ sessionId }) }),
    groupLeave: (id, sessionId) => request(`/group-calls/${id}/leave`, { method: "POST", headers: { "X-Device-ID": groupDeviceID() }, body: JSON.stringify({ sessionId }) }),
    groupEnd: (id) => request(`/group-calls/${id}/end`, { method: "POST" }),
    groupSignal: (id, type, sourceSessionId, targetSessionId, payload) => request(`/group-calls/${id}/signal`, { method: "POST", headers: { "X-Device-ID": groupDeviceID() }, body: JSON.stringify({ type, sourceSessionId, targetSessionId, payload }) }),
  };
})();
