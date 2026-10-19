(() => {
  "use strict";

  const tokenKey = "mini-hermes.access-token";
  const usernameKey = "mini-hermes.username";
  const vaultKey = "mini-hermes.vault-key.v2";
  const vaultUserKey = "mini-hermes.vault-user.v2";
  const page = document.body.dataset.authPage;
  const form = document.querySelector(page === "register" ? "#register-form" : "#login-form");
  const button = document.querySelector(page === "register" ? "#register-button" : "#login-button");
  const notice = document.querySelector("#notice");
  const error = document.querySelector("#error");

  function sessionValue(key) {
    try { return sessionStorage.getItem(key) || ""; } catch (_) { return ""; }
  }
  function decodeSubject(token) {
    try {
      const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).sub || "";
    } catch (_) { return ""; }
  }
  function show(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }
  function friendlyError(value) {
    const detail = value?.details?.error;
    if (detail === "invalid username or password" || value?.status === 401) return "Tên tài khoản hoặc mật khẩu không đúng.";
    if (detail === "username already exists") return "Tên tài khoản đã được sử dụng.";
    if (detail === "user not found") return "Không tìm thấy tài khoản này.";
    if (value?.status === 413) return "Thông tin quá dài. Vui lòng rút ngắn rồi thử lại.";
    if (value?.status >= 500) return "Máy chủ đang bận. Vui lòng thử lại sau.";
    return value?.message || "Chưa thể hoàn tất. Vui lòng kiểm tra thông tin và thử lại.";
  }
  async function request(path, options = {}) {
    const response = await fetch(path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(body.error || "Yêu cầu không thành công.");
      failure.status = response.status;
      failure.details = body;
      throw failure;
    }
    return body;
  }
  function saveSession(response, username, credential) {
    const userID = decodeSubject(response.access_token);
    if (!userID || response.user_id !== userID || !MiniHermesE2EEClient.validKey(credential.vault_key)) {
      throw new Error("Thông tin đăng nhập không hợp lệ.");
    }
    sessionStorage.setItem(tokenKey, response.access_token);
    sessionStorage.setItem(usernameKey, username);
    sessionStorage.setItem(vaultKey, credential.vault_key);
    sessionStorage.setItem(vaultUserKey, userID);
  }
  async function login(username, credential) {
    const response = await request("/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, auth_credential: credential.auth_credential }),
    });
    saveSession(response, username, credential);
  }
  async function waitForCrypto() {
    if (!globalThis.MiniHermesWASM) throw new Error("Không thể tải bộ mã hóa. Hãy tải lại trang.");
    await MiniHermesWASM.load();
    if (!globalThis.MiniHermesE2EEClient) throw new Error("Không thể khởi tạo bộ mã hóa.");
  }

  if (sessionValue(tokenKey) && sessionValue(vaultKey)) {
    location.replace("/app");
    return;
  }
  const query = new URLSearchParams(location.search);
  if (query.get("logged_out") === "1") show(notice, "Bạn đã đăng xuất an toàn.");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    show(error, "");
    show(notice, page === "register" ? "Đang tạo khóa mã hóa và tài khoản..." : "Đang xác minh tài khoản...");
    const usernameInput = form.elements.username;
    const passwordInput = form.elements.password;
    try {
      await waitForCrypto();
      const username = MiniHermesE2EEClient.normalizeUsername(usernameInput.value);
      const password = passwordInput.value;
      if (page === "register") {
        const account = await MiniHermesE2EEClient.createAccount(username, password);
        await request("/auth/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, auth_credential: account.auth_credential, kdf: account.kdf,
            public_bundle: account.public_bundle, account_vault: account.account_vault }),
        });
        show(notice, "Tài khoản đã tạo. Đang mở ứng dụng...");
        await login(username, account);
      } else {
        const params = await request("/auth/params?username=" + encodeURIComponent(username));
        if (params.username !== username) throw new Error("Hồ sơ đăng nhập không khớp tài khoản.");
        const credential = await MiniHermesE2EEClient.deriveCredentials(username, password, params.kdf);
        await login(username, credential);
      }
      location.replace("/app");
    } catch (failure) {
      passwordInput.value = "";
      show(notice, "");
      show(error, friendlyError(failure));
      passwordInput.focus();
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });
})();
