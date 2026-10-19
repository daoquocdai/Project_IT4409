(() => {
  "use strict";
  const tokenKey = "mini-hermes.access-token";
  let authenticated = false;
  try { authenticated = Boolean(sessionStorage.getItem(tokenKey)); } catch (_) {}
  if (!authenticated) return;
  for (const container of document.querySelectorAll("[data-auth-actions]")) {
    const link = document.createElement("a");
    link.className = "button button-primary";
    link.href = "/app";
    link.textContent = "Mở ứng dụng";
    container.replaceChildren(link);
  }
})();
