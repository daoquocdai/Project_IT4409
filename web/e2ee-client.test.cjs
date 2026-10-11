// Run after building the matching Go/WASM artifacts: node --test web/e2ee-client.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const nativeFetch = globalThis.fetch;

globalThis.crypto ||= require("node:crypto").webcrypto;
globalThis.isSecureContext = true;
globalThis.localStorage = (() => {
  const values = new Map();
  return { get length() { return values.size; }, key: (index) => [...values.keys()][index],
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key), clear: () => values.clear() };
})();
globalThis.fetch = async (url) => {
  assert.equal(url, "/e2ee.wasm");
  const bytes = fs.readFileSync(path.join(__dirname, "e2ee.wasm"));
  return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
require("./wasm_exec.js");
require("./e2ee-wasm.js");
require("./e2ee-state.js");
require("./e2ee.js");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const T = "33333333-3333-4333-8333-333333333333";
const OFFLINE = "44444444-4444-4444-8444-444444444444";
const toB = (id = T) => ({ id, kind: "direct", peer: { id: B, username: "bob" } });
const toA = (id = T) => ({ id, kind: "direct", peer: { id: A, username: "alice" } });
const clone = (value) => structuredClone(value);

function browserFixture(fetchAPI, cache = new Map()) {
  const vm = require("node:vm");
  function element(tag = "div") {
    return { tag, hidden: false, disabled: false, value: "", checked: false, textContent: "", dataset: {},
      children: [], events: {}, scrollHeight: 100, scrollTop: 0, clientHeight: 100, elements: {},
      classList: { add() {} }, get options() { return this.children.filter((child) => child.tag === "option"); },
      addEventListener(name, listener) { this.events[name] = listener; },
      append(...items) { this.children.push(...items); if (this.tag === "select" && !this.value) this.value = this.options[0]?.value || ""; },
      replaceChildren(...items) { this.children = []; if (this.tag === "select") this.value = ""; this.append(...items); },
      reset() { for (const item of Object.values(this.elements)) item.value = ""; },
      focus() {}, setAttribute() {}, removeAttribute(name) { if (name === "maxlength") this.maxLength = -1; },
      querySelectorAll(selector) {
        const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
        return selector === "input:checked" ? descendants.filter((child) => child.tag === "input" && child.checked) : descendants;
      },
      querySelector(selector) { return selector === ".message:last-child"
        ? this.children.filter((item) => item.dataset?.seq).at(-1) : null; },
      getBoundingClientRect() { return { top: 0, bottom: 100, left: 0, right: 100 }; } };
  }
  const nodes = new Map([...fs.readFileSync(path.join(__dirname, "index.html"), "utf8")
    .matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"/g)].map((match) => [match[2], element(match[1])]));
  for (const name of ["register", "login"]) nodes.get(name + "-form").elements = {
    username: nodes.get(name + "-username"), password: nodes.get(name + "-password") };
  nodes.get("group-form").elements = { name: nodes.get("group-name") };
  class Socket { static OPEN = 1; readyState = 0; close() { this.readyState = 3; this.onclose?.(); } }
  const timers = new Map(), windowEvents = {}, documentEvents = {};
  let timerID = 0, now = 0;
  const context = vm.createContext({ console, crypto, WebAssembly, isSecureContext: true,
    MiniHermesWASM, MiniHermesE2EEStorage, Headers, AbortController, AbortSignal, URL, URLSearchParams,
    atob, btoa, structuredClone, WebSocket: Socket, innerWidth: 100, innerHeight: 100,
    location: { origin: "https://chat.test" }, fetch: fetchAPI,
    setTimeout(callback, delay) { timers.set(++timerID, { callback, due: now + delay }); return timerID; },
    clearTimeout(id) { timers.delete(id); }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    sessionStorage: { getItem: (key) => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value),
      removeItem: (key) => cache.delete(key) },
    window: { addEventListener(name, listener) { windowEvents[name] = listener; }, innerWidth: 100, innerHeight: 100 },
    document: { visibilityState: "visible", querySelector: (selector) => nodes.get(selector.slice(1)) || null,
      createElement: element, addEventListener(name, listener) { documentEvents[name] = listener; } } });
  for (const file of ["e2ee.js", "realtime-core.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context, { filename: file });
  }
  return { context, nodes, cache, timers, windowEvents, documentEvents,
    run: (code) => vm.runInContext(code, context),
    async advance(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due; timers.delete(next[0]); next[1].callback();
        await new Promise(setImmediate);
      }
      now = target;
      await new Promise(setImmediate);
    } };
}

function apiResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => clone(body) };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function frontendFixture(handler) {
  const calls = [];
  const ui = browserFixture(async (url, options = {}) => {
    const call = { url, method: options.method || "GET", raw: options.body,
      body: options.body ? JSON.parse(options.body) : null };
    calls.push(call);
    return handler(call);
  });
  ui.context.fixtureUsers = [{ id: A, username: "alice" }, { id: B, username: "bob" }];
  ui.context.fixtureThread = { id: T, kind: "group", name: "Fixture group", role: "admin", member_count: 2,
    joined_seq: 1, last_seq: 0, last_read_seq: 0, unread_count: 0 };
  ui.run(`state.token = "fixture-token"; state.currentUserID = fixtureUsers[0].id;
    state.currentUsername = fixtureUsers[0].username; state.users = fixtureUsers;
    state.e2ee = { canRead: () => true, canSend: () => true,
      snapshot: () => ({ status: "ready", pending: [] }), close: async () => {} };
    state.currentCache = reconcileThreadSummary(fixtureThread); state.threadID = fixtureThread.id;
    state.currentCache.messagesLoaded = true; renderThreadHeading(); renderPeerList();`);
  return { ...ui, calls, submit: () => ui.nodes.get("message-form").events.submit({ preventDefault() {} }),
    refresh: () => ui.nodes.get("refresh-users-button").events.click(),
    socketEvent(event) { ui.context.fixtureEvent = JSON.stringify(event); ui.run("handleSocketMessage(fixtureEvent)"); } };
}

function sentMessage(call, seq = 1) {
  return { id: call.body.message_id, thread_id: T, sender_id: A, seq, kind: "text", content_format: "plaintext",
    content: call.body.content, created_at: "2026-10-11T00:00:00Z" };
}

async function proposeSession(client, thread) {
  const context = { thread_id: thread.id, epoch_id: crypto.randomUUID(),
    sender_id: client.userID, recipient_id: thread.peer.id };
  const bundle = await client.request("/e2ee/bundles/" + thread.peer.id + "/claim", {
    method: "POST", body: JSON.stringify({ thread_id: thread.id }) });
  const bridge = await MiniHermesWASM.load();
  const created = bridge.call("createEpoch", { context, identity: client.account.identity, bundle });
  const backup = bridge.call("encryptEpochBackup", { vault_key: client.vaultKey, owner_id: client.userID,
    header: created.header, session_key: created.session_key });
  return { epoch_id: context.epoch_id, bootstrap: created.header, key_backup: backup.backup };
}

// This API fixture selects one fixed session per thread and immutable owner backups.
// Crypto always runs through the real Go/WASM bridge.
function server(accounts) {
  const epochs = new Map();
  const current = new Map();
  const messages = new Map();
  const claims = new Map([...accounts].map(([id, value]) => [id, [...value.public_bundle.one_time_prekeys]]));
  const log = [];
  let loseMessageReply = false;
  let failBackup = false;
  function response(record, owner) {
    return { epoch_id: record.epoch_id, thread_id: record.thread_id, sender_id: record.sender_id,
      recipient_id: record.recipient_id, bootstrap: record.bootstrap, key_backup: record.backups.get(owner) || null };
  }
  function error(status, body) { return Object.assign(new Error(body.error), { status, details: body }); }
  const request = (owner) => async (url, options = {}) => {
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    log.push({ owner, url, method, body, raw: options.body });
    if (url === "/e2ee/account") {
      const account = accounts.get(owner);
      return clone({ user_id: owner, username: account.username, kdf: account.kdf,
        public_bundle: account.public_bundle, account_vault: account.account_vault });
    }
    let match = url.match(/^\/e2ee\/bundles\/([^/]+)\/claim$/);
    if (match && method === "POST") {
      const bundle = accounts.get(match[1]).public_bundle;
      return clone({ user_id: match[1], identity_public_key: bundle.identity_public_key,
        signed_prekey: bundle.signed_prekey, one_time_prekey: claims.get(match[1]).shift() || null });
    }
    match = url.match(/^\/threads\/([^/]+)\/epochs$/);
    if (match) {
      const threadID = match[1], active = current.get(threadID) || null;
      if (method === "GET") return clone({ epochs: [...epochs.values()].filter((item) => item.thread_id === threadID)
        .map((item) => response(item, owner)), current_epoch_id: active });
      assert.deepEqual(Object.keys(body).sort(), ["bootstrap", "epoch_id", "key_backup"]);
      if (active) {
        const winner = epochs.get(active);
        if (body.epoch_id === active && winner.sender_id === owner && winner.bootstrap === body.bootstrap &&
            JSON.stringify(winner.backups.get(owner)) === JSON.stringify(body.key_backup)) {
          return clone(response(winner, owner));
        }
        throw error(409, { error: "epoch conflict", epoch: response(winner, owner) });
      }
      const header = JSON.parse(body.bootstrap);
      const record = { ...body, thread_id: threadID, sender_id: header.sender_id, recipient_id: header.recipient_id,
        backups: new Map([[owner, body.key_backup]]) };
      epochs.set(body.epoch_id, record);
      current.set(threadID, body.epoch_id);
      return clone(response(record, owner));
    }
    match = url.match(/^\/threads\/([^/]+)\/epochs\/([^/]+)\/key$/);
    if (match && method === "PUT") {
      if (failBackup) { failBackup = false; throw error(503, { error: "backup unavailable" }); }
      const record = epochs.get(match[2]);
      assert.equal(record.thread_id, match[1]);
      if (!record.backups.has(owner)) record.backups.set(owner, body.key_backup);
      return clone({ key_backup: record.backups.get(owner) });
    }
    match = url.match(/^\/threads\/([^/]+)\/messages$/);
    if (match && method === "POST") {
      if (!messages.has(body.message_id)) messages.set(body.message_id, {
        id: body.message_id, thread_id: match[1], sender_id: owner, seq: messages.size + 1, kind: "text",
        content_format: body.content_format, content: body.content, created_at: new Date().toISOString() });
      if (loseMessageReply) { loseMessageReply = false; throw new Error("response lost after commit"); }
      return clone(messages.get(body.message_id));
    }
    throw new Error("Unexpected API request: " + url);
  };
  return { request, log, epochs, messages, current,
    loseNextMessageReply() { loseMessageReply = true; }, failNextBackup() { failBackup = true; } };
}

test("fixed multi-device sessions, concurrent initialization, password recovery and exact retries", { timeout: 300000 }, async () => {
  const alice = await MiniHermesE2EEClient.createAccount("alice", "Alice portable password!");
  const bob = await MiniHermesE2EEClient.createAccount("bob", "Bob portable password!");
  const api = server(new Map([[A, alice], [B, bob]]));
  const make = async (id, account, credential = account) => {
    const client = MiniHermesE2EEClient.create({ apiURL: "https://chat.test", userID: id,
      username: account.username, vaultKey: credential.vault_key, request: api.request(id) });
    await client.start();
    assert.equal(client.canRead(), true);
    return client;
  };
  const a1 = await make(A, alice), a2 = await make(A, alice), b1 = await make(B, bob);
  const [first, reply] = await Promise.all([a1.send(toB(), "alice first"), b1.send(toA(), "bob reply")]);
  assert.equal(api.epochs.size, 1, "concurrent proposals must select one committed epoch");
  assert.equal(JSON.parse(first.content).epoch_id, JSON.parse(reply.content).epoch_id);
  const sessionID = JSON.parse(first.content).epoch_id;
  const accepted = api.log.find((item) => item.method === "POST" && item.url === "/threads/" + T + "/epochs" &&
    item.body.epoch_id === sessionID);
  const repeated = await api.request(accepted.owner)(accepted.url, { method: "POST", body: accepted.raw });
  assert.equal(repeated.epoch_id, sessionID, "an exact initialization retry must return the same session");
  assert.equal(api.epochs.size, 1);
  assert.equal((await a2.receive(toB(), { ...first, recipient_id: A })).plaintext, "alice first",
    "sender delivery target must not be mistaken for crypto recipient");
  assert.equal((await a1.receive(toB(), reply)).plaintext, "bob reply");
  assert.equal((await b1.receive(toA(), first)).plaintext, "alice first");
  const claimsBefore = api.log.filter((item) => item.url.endsWith("/claim")).length;
  const concurrent = await Promise.all([a1.send(toB(), "from device one"), a2.send(toB(), "from device two")]);
  assert.equal(new Set(concurrent.map((item) => item.id)).size, 2);
  assert.equal(api.log.filter((item) => item.url.endsWith("/claim")).length, claimsBefore,
    "messages in an existing epoch must not claim prekeys or repeat X3DH");

  const offline = await a1.send(toB(OFFLINE), "recipient has not opened this thread");
  const offlineEpoch = api.epochs.get(JSON.parse(offline.content).epoch_id);
  assert.equal(offlineEpoch.backups.has(B), false);
  localStorage.clear(); // Fresh profile / ended private-browsing session.
  const restoredBob = await MiniHermesE2EEClient.deriveCredentials("bob", "Bob portable password!", bob.kdf);
  const bFresh = await make(B, bob, restoredBob);
  api.failNextBackup();
  assert.equal((await bFresh.receive(toA(OFFLINE), offline)).status, "error",
    "recipient must not accept SK before its backup is durably acknowledged");
  assert.equal((await bFresh.receive(toA(OFFLINE), offline)).plaintext, "recipient has not opened this thread");
  assert.equal(offlineEpoch.backups.has(B), true);

  const competing = await proposeSession(b1, toA());
  await assert.rejects(() => api.request(B)("/threads/" + T + "/epochs", {
    method: "POST", body: JSON.stringify(competing) }),
  (error) => error.status === 409 && error.details.epoch.epoch_id === sessionID);
  assert.equal(api.epochs.size, 2, "an initialized direct thread must refuse a different session proposal");
  const continued = await b1.send(toA(), "same session message");
  assert.equal(JSON.parse(continued.content).epoch_id, sessionID);
  localStorage.clear();
  const restoredAlice = await MiniHermesE2EEClient.deriveCredentials("alice", "Alice portable password!", alice.kdf);
  const aFresh = await make(A, alice, restoredAlice);
  assert.equal((await aFresh.receive(toB(), first)).plaintext, "alice first", "sent history survives an empty profile");
  assert.equal((await aFresh.receive(toB(), reply)).plaintext, "bob reply", "received history survives an empty profile");
  assert.equal((await aFresh.receive(toB(), continued)).plaintext, "same session message");
  assert.equal((await aFresh.receive(toB(OFFLINE), offline)).plaintext, "recipient has not opened this thread");
  assert.equal(bFresh.account.one_time_prekeys.length, 20, "immutable archived private OPKs must remain recoverable");
  const claimsAfterRestore = api.log.filter((item) => item.url.endsWith("/claim")).length;
  const resumed = await aFresh.send(toB(), "fresh device keeps the session");
  assert.equal(JSON.parse(resumed.content).epoch_id, sessionID);
  assert.equal((await bFresh.receive(toA(), resumed)).plaintext, "fresh device keeps the session");
  assert.equal(api.log.filter((item) => item.url.endsWith("/claim")).length, claimsAfterRestore,
    "fresh devices must restore the fixed session without another prekey claim");
  assert.equal(api.current.get(T), sessionID);

  api.loseNextMessageReply();
  await assert.rejects(() => a2.send(toB(), "retry unchanged"), /response lost/);
  const pending = a2.snapshot().pending[0];
  const original = api.log.filter((item) => item.body?.message_id === pending.message_id).at(-1).raw;
  const retried = await a2.retry(pending.message_id);
  assert.equal(retried.id, pending.message_id);
  assert.equal(api.log.filter((item) => item.body?.message_id === pending.message_id).at(-1).raw, original);
  assert.equal(a2.snapshot().pending.length, 0);
  assert.equal((await bFresh.receive(toA(), retried)).plaintext, "retry unchanged");
  const corrupted = { ...retried, content: retried.content.replace(/ciphertext":"./, 'ciphertext":"!') };
  assert.equal((await bFresh.receive(toA(), corrupted)).status, "error");
  assert.equal(JSON.stringify(api.log).includes("Alice portable password!"), false);
  assert.equal(JSON.stringify(api.log).includes(alice.vault_key), false);
  assert.equal(JSON.stringify(api.log).includes(a1.account.identity.private_key), false);
  await Promise.all([a1, a2, b1, bFresh, aFresh].map((client) => client.close()));
});

test("UI registration/login never send password, reload recovers the vault, groups remain plaintext", { timeout: 300000 }, async () => {
  const password = "One password for ui account!";
  const userID = crypto.randomUUID();
  const groupID = crypto.randomUUID();
  const logs = [], groupMessages = [];
  let registered;
  const jwt = "header." + Buffer.from(JSON.stringify({ sub: userID })).toString("base64url") + ".signature";
  const group = { id: groupID, kind: "group", name: "UI group", role: "admin", member_count: 2,
    joined_seq: 1, last_seq: 0, last_read_seq: 0, unread_count: 0 };
  async function fetchAPI(url, options = {}) {
    const body = options.body ? JSON.parse(options.body) : null;
    logs.push({ url, method: options.method || "GET", body, authorization: options.headers.get("Authorization") });
    const ok = (data, status = 200) => ({ ok: true, status, json: async () => clone(data) });
    if (url === "/auth/register") {
      assert.deepEqual(Object.keys(body).sort(), ["account_vault", "auth_credential", "kdf", "public_bundle", "username"]);
      registered = body;
      return ok({ id: userID, username: body.username }, 201);
    }
    if (url.startsWith("/auth/params?")) return ok({ username: registered.username, kdf: registered.kdf });
    if (url === "/auth/login") {
      assert.deepEqual(Object.keys(body).sort(), ["auth_credential", "username"]);
      if (body.auth_credential !== registered.auth_credential) {
        return { ok: false, status: 401, json: async () => ({ error: "invalid credentials" }) };
      }
      return ok({ access_token: jwt, token_type: "Bearer", user_id: userID });
    }
    assert.equal(options.headers.get("Authorization"), "Bearer " + jwt);
    if (url === "/users") return ok([{ id: userID, username: registered.username }, { id: B, username: "bob" }]);
    if (url === "/e2ee/account") return ok({ ...registered, auth_credential: undefined, user_id: userID });
    if (url === "/threads") return ok([group]);
    if (url === "/auth/ws-ticket") return ok({ ws_url: "wss://chat.test/ws", ticket: "test-ticket" });
    if (url.startsWith("/threads/" + groupID + "/messages?")) return ok({ messages: groupMessages, next_cursor: null });
    if (url === "/threads/" + groupID + "/messages") {
      assert.equal(body.content_format, undefined);
      const message = { id: body.message_id, thread_id: groupID, sender_id: userID, seq: groupMessages.length + 1,
        kind: "text", content_format: "plaintext", content: body.content, created_at: new Date().toISOString() };
      groupMessages.push(message);
      group.last_seq = message.seq;
      return ok(message);
    }
    throw new Error("Unexpected UI request: " + url);
  }
  function browser(cache = new Map()) {
    return browserFixture(fetchAPI, cache);
  }
  const first = browser();
  first.nodes.get("register-username").value = " Ui_User ";
  first.nodes.get("register-password").value = password;
  await first.nodes.get("register-form").events.submit({ preventDefault() {} });
  assert.equal(first.run("state.e2ee?.canRead()"), true);
  assert.equal(first.nodes.get("chat-view").hidden, false);
  assert.equal(first.nodes.get("register-password").value, "");
  assert.equal(registered.username, "ui_user");
  assert.equal(first.cache.has("mini-hermes.vault-key.v2"), true);
  assert.equal([...first.cache.values()].includes(password), false);
  first.context.groupID = groupID;
  await first.run("openThread(groupID)");
  first.nodes.get("content").value = "group stays plaintext";
  await first.nodes.get("message-form").events.submit({ preventDefault() {} });
  assert.equal(groupMessages[0].content, "group stays plaintext");
  assert.equal(first.run("state.currentCache.pendingSend"), null);

  const reloadLogs = logs.length;
  const reload = browser(new Map(first.cache));
  while (reload.run("state.authBusy")) await new Promise(setImmediate);
  assert.equal(reload.run("state.e2ee?.canRead()"), true);
  assert.equal(logs.slice(reloadLogs).some((item) => item.url === "/e2ee/account"), true);
  assert.equal(logs.slice(reloadLogs).some((item) => item.url === "/auth/login"), false);
  assert.equal(logs.slice(reloadLogs).some((item) => item.url === "/auth/register"), false);

  const fresh = browser(); // No token, key, IndexedDB or prior tab required.
  fresh.nodes.get("login-username").value = "ui_user";
  fresh.nodes.get("login-password").value = "wrong password";
  await fresh.nodes.get("login-form").events.submit({ preventDefault() {} });
  assert.equal(fresh.run("state.e2ee"), null);
  assert.equal(fresh.nodes.get("chat-view").hidden, true);
  fresh.nodes.get("login-password").value = password;
  await fresh.nodes.get("login-form").events.submit({ preventDefault() {} });
  assert.equal(fresh.run("state.e2ee.canRead()"), true);
  assert.equal(fresh.nodes.get("login-password").value, "");
  assert.equal(fresh.run("state.e2ee.fingerprint"), first.run("state.e2ee.fingerprint"));
  assert.equal(JSON.stringify(logs).includes(password), false);
  assert.equal(JSON.stringify(logs).includes(first.run("state.vaultKey")), false);
  assert.equal(first.run("state.currentCache.messages.get(1).content"), "group stays plaintext");
  for (const instance of [first, reload, fresh]) instance.nodes.get("logout-button").events.click();
});

test("group validation precedes UUID/pending and uses Go whitespace and Unicode code points", async () => {
  const ui = frontendFixture((call) => apiResponse(sentMessage(call)));
  let generated = 0;
  ui.context.crypto = { randomUUID() { generated += 1; return crypto.randomUUID(); } };
  for (const content of ["", "  \t\r\n  ", "\u0085\u00a0\u3000", "hello\0world", "🙂".repeat(1001)]) {
    ui.nodes.get("content").value = content;
    await ui.submit();
    assert.equal(ui.run("state.currentCache.pendingSend"), null);
    assert.equal(ui.calls.length, 0);
    assert.equal(generated, 0, "invalid content must not allocate a request UUID");
    assert.equal(ui.nodes.get("content").value, content);
    assert.equal(ui.nodes.get("send-button").textContent, "Gửi");
    assert.doesNotMatch(ui.nodes.get("error").textContent, /Gửi lại/);
  }
  const content = "\u0085 " + "🙂".repeat(1000) + " \u3000";
  ui.nodes.get("content").value = content;
  ui.nodes.get("content").events.input();
  assert.equal(ui.nodes.get("error").textContent, "");
  await ui.submit();
  assert.equal(generated, 1);
  assert.equal(ui.calls[0].body.content, content, "validation must preserve the original send body");
  assert.equal(ui.nodes.get("content").maxLength, -1, "HTML UTF-16 maxlength must not truncate 1000 astral points");
  assert.equal(ui.run('validGroupContent("\\ufeff")'), true, "Go TrimSpace preserves U+FEFF");
});

test("definite 400/413 rejection releases pending, preserves edited draft, and permits a new UUID", async () => {
  for (const status of [400, 413]) {
    const first = deferred();
    const ui = frontendFixture((call) => ui.calls.length === 1 ? first.promise : apiResponse(sentMessage(call)));
    ui.nodes.get("content").value = "first body";
    const sending = ui.submit();
    const pending = ui.run("state.currentCache.pendingSend");
    ui.nodes.get("content").value = "edited while waiting";
    ui.nodes.get("content").events.input();
    first.resolve(apiResponse({ error: "invalid content" }, status));
    await sending;
    assert.equal(ui.run("state.currentCache.pendingSend"), null);
    assert.equal(ui.nodes.get("content").value, "edited while waiting");
    assert.equal(ui.run("state.currentCache.draftContent"), "edited while waiting");
    assert.equal(ui.nodes.get("send-button").textContent, "Gửi");
    assert.equal(ui.nodes.get("send-button").disabled, false);
    assert.doesNotMatch(ui.nodes.get("error").textContent, /Gửi lại|nội dung cũ|chưa được xác nhận/);
    await ui.submit();
    assert.equal(ui.calls.length, 2, "definite rejection must not automatically retry");
    assert.notEqual(ui.calls[1].body.message_id, pending.messageID);
    assert.equal(ui.calls[1].body.content, "edited while waiting");
    assert.equal(ui.run("state.currentCache.pendingSend"), null);
  }
});

test("network errors, timeouts and 503 retain the exact group UUID and body on every retry", async () => {
  for (const failure of [new Error("connection lost"), Object.assign(new Error("timeout"), { name: "TimeoutError" }), 503]) {
    const ui = frontendFixture((call) => {
      if (ui.calls.length <= 2) {
        if (failure === 503) return apiResponse({ error: "publish unavailable" }, 503);
        throw failure;
      }
      return apiResponse(sentMessage(call));
    });
    const original = " \u0085retry unchanged 🙂\u3000 ";
    ui.nodes.get("content").value = original;
    await ui.submit();
    const pending = ui.run("state.currentCache.pendingSend");
    assert.ok(pending);
    assert.equal(pending.inFlight, false);
    assert.equal(pending.content, original);
    assert.equal(ui.calls.length, 2);
    assert.equal(ui.calls[0].raw, ui.calls[1].raw);
    assert.equal(ui.nodes.get("send-button").textContent, "Gửi lại");
    ui.nodes.get("content").value = "different draft";
    ui.nodes.get("content").events.input();
    await ui.submit();
    assert.equal(ui.calls.length, 2, "an uncertain send may not be replaced with edited content");
    ui.nodes.get("content").value = original;
    ui.nodes.get("content").events.input();
    await ui.submit();
    assert.equal(ui.calls[2].raw, ui.calls[0].raw);
    assert.equal(ui.calls[2].body.message_id, pending.messageID);
    assert.equal(ui.run("state.currentCache.pendingSend"), null);
  }
});

test("a definite rejection clears only the pending belonging to that request", async () => {
  const reply = deferred();
  const ui = frontendFixture(() => reply.promise);
  ui.nodes.get("content").value = "old pending";
  const sending = ui.submit();
  ui.run(`state.currentCache.pendingSend = { messageID: "replacement", content: "new pending", inFlight: false };
    state.currentCache.draftContent = "new pending"; contentInput.value = "new pending";`);
  const replacement = ui.run("state.currentCache.pendingSend");
  reply.resolve(apiResponse({ error: "request rejected" }, 400));
  await sending;
  assert.equal(ui.run("state.currentCache.pendingSend"), replacement);
  assert.equal(ui.nodes.get("content").value, "new pending");
  assert.equal(ui.nodes.get("send-button").textContent, "Gửi lại");
});

test("old send responses preserve another conversation and a replacement account session", async () => {
  for (const status of [200, 400, 413, 401]) {
    const reply = deferred();
    const ui = frontendFixture(() => reply.promise);
    ui.nodes.get("content").value = "old request";
    const sending = ui.submit();
    ui.context.otherThreadID = OFFLINE;
    ui.run(`const other = reconcileThreadSummary({ ...fixtureThread, id: otherThreadID, name: "Other" });
      other.messagesLoaded = true; other.pendingSend = { messageID: "other-pending", content: "other draft", inFlight: false };
      other.draftContent = "other draft"; state.currentCache = other; state.threadID = other.threadID;
      state.conversationVersion += 1; contentInput.value = other.draftContent; renderThreadHeading(); showError("other error");`);
    reply.resolve(status === 200 ? apiResponse(sentMessage(ui.calls[0])) : apiResponse({ error: "old error" }, status));
    await sending;
    if (status === 401) {
      assert.equal(ui.run("state.token"), "", "a current-session 401 must retain the existing logout behavior");
    } else {
      assert.equal(ui.nodes.get("content").value, "other draft");
      assert.equal(ui.nodes.get("error").textContent, "other error");
      assert.equal(ui.run("state.currentCache.pendingSend.messageID"), "other-pending");
      assert.equal(ui.run("state.currentCache.messages.size"), 0);
      assert.equal(ui.run("state.currentCache.summary.last_seq"), 0);
    }

    const oldReply = deferred();
    const switched = frontendFixture(() => oldReply.promise);
    switched.nodes.get("content").value = "account A request";
    const oldSending = switched.submit();
    switched.run(`clearSession(); state.token = "new-account-token"; state.currentUserID = "${B}";
      state.currentUsername = "bob"; state.currentCache = reconcileThreadSummary({ ...fixtureThread });
      state.currentCache.messagesLoaded = true; state.threadID = fixtureThread.id;
      state.currentCache.pendingSend = { messageID: "new-account-pending", content: "account B draft", inFlight: false };
      contentInput.value = "account B draft"; renderThreadHeading(); showError("account B error");`);
    oldReply.resolve(status === 200 ? apiResponse(sentMessage(switched.calls[0])) : apiResponse({ error: "old error" }, status));
    await oldSending;
    assert.equal(switched.run("state.token"), "new-account-token");
    assert.equal(switched.nodes.get("content").value, "account B draft");
    assert.equal(switched.nodes.get("error").textContent, "account B error");
    assert.equal(switched.run("state.currentCache.pendingSend.messageID"), "new-account-pending");
    assert.equal(switched.run("state.currentCache.messages.size"), 0);
    assert.equal(switched.run("state.currentCache.summary.last_seq"), 0);
  }
});

test("403 refreshes permissions and 409 preserves the existing uncertain pending behavior", async () => {
  for (const status of [403, 409]) {
    const ui = frontendFixture((call) => call.url === "/threads" ? apiResponse([ui.context.fixtureThread])
      : apiResponse({ error: "send refused" }, status));
    ui.nodes.get("content").value = "keep request";
    await ui.submit();
    assert.ok(ui.run("state.currentCache.pendingSend"));
    assert.equal(ui.nodes.get("send-button").textContent, "Gửi lại");
    assert.equal(ui.calls.filter((call) => call.method === "POST").length, 1);
    assert.equal(ui.calls.filter((call) => call.url === "/threads").length, status === 403 ? 1 : 0);
  }
});

test("thread.updated validates recipient/thread, debounces summary refresh and never creates a message", async () => {
  const ui = frontendFixture((call) => {
    assert.equal(call.url, "/threads", "read notifications may only request summaries when history is complete");
    return apiResponse([{ ...ui.context.fixtureThread, last_seq: 5, last_read_seq: 5, unread_count: 0 }]);
  });
  ui.run("state.currentCache.syncedSeq = 5; state.currentCache.summary.last_seq = 5; state.currentCache.summary.unread_count = 3;");
  for (const event of [null, {}, { type: "heartbeat" }, { type: "thread.updated", thread_id: T, recipient_id: B },
    { type: "thread.updated", thread_id: "bad-thread", recipient_id: A },
    { type: "thread.updated", thread_id: "00000000-0000-0000-0000-000000000000", recipient_id: A },
    { type: "thread.updated", thread_id: 1, recipient_id: A }, { type: "thread.updated", thread_id: T }]) ui.socketEvent(event);
  await ui.advance(1000);
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.timers.size, 0);
  for (let index = 0; index < 5; index += 1) ui.socketEvent({ type: "thread.updated", thread_id: T, recipient_id: A });
  assert.equal(ui.run("state.currentCache.summary.unread_count"), 3, "the notification must not invent counters");
  assert.equal(ui.run("state.currentCache.lastReadSeq"), 0);
  assert.equal(ui.run("state.currentCache.messages.size"), 0);
  assert.equal(ui.run("state.currentCache.summary.last_seq"), 5);
  await ui.advance(749);
  assert.equal(ui.calls.length, 0);
  await ui.advance(1);
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.run("state.currentCache.lastReadSeq"), 5);
  assert.equal(ui.run("state.currentCache.summary.unread_count"), 0);
  assert.equal(ui.run("state.currentCache.messages.size"), 0);
  assert.equal(ui.run("state.currentCache.messageIDs.size"), 0);
  assert.equal(ui.run("state.currentCache.eventMessages.size"), 0);
  assert.equal(ui.run("state.currentCache.syncedSeq"), 5);
  ui.socketEvent({ type: "heartbeat" });
  await ui.advance(10000);
  assert.equal(ui.calls.length, 1, "idle and heartbeat frames may not add polling");
  ui.socketEvent({ type: "message.created", thread_id: T, recipient_id: A, message_id: crypto.randomUUID(),
    sender_id: B, seq: 6, kind: "text", content_format: "plaintext", content: "ordinary message",
    created_at: "2026-10-11T00:00:00Z" });
  assert.equal(ui.run("state.currentCache.messages.size"), 1, "message.created must retain normal dispatch");
  assert.equal(ui.run("state.currentCache.summary.last_seq"), 6);
  assert.equal(ui.run("state.currentCache.syncedSeq"), 6);
  assert.equal(ui.run("state.currentCache.summary.unread_count"), 1);
});

test("a queued read notification cannot refresh a replacement login session", async () => {
  const ui = frontendFixture(() => { throw new Error("old session must not refresh"); });
  ui.socketEvent({ type: "thread.updated", thread_id: T, recipient_id: A });
  ui.run(`clearSession(); state.token = "replacement-token"; state.currentUserID = "${B}";`);
  await ui.advance(750);
  assert.equal(ui.calls.length, 0);
});

test("read summaries update peer read markers and cannot overwrite a newer local read", async () => {
  let summary;
  const ui = frontendFixture(() => apiResponse([summary]));
  ui.run(`state.currentCache.summary = { ...fixtureThread, kind: "direct", peer: fixtureUsers[1], last_seq: 5 };
    state.currentCache.syncedSeq = 5; state.currentCache.lastReadSeq = 5;
    state.currentCache.peerLastReadSeq = 2;`);
  summary = { ...ui.context.fixtureThread, kind: "direct", peer: { id: B, username: "bob" }, last_seq: 5,
    last_read_seq: 3, peer_last_read_seq: 4, unread_count: 2 };
  ui.socketEvent({ type: "thread.updated", thread_id: T, recipient_id: A });
  await ui.advance(750);
  assert.equal(ui.run("state.currentCache.lastReadSeq"), 5);
  assert.equal(ui.run("state.currentCache.summary.unread_count"), 0);
  assert.equal(ui.run("state.currentCache.peerLastReadSeq"), 4);
  summary.peer_last_read_seq = 1;
  ui.socketEvent({ type: "thread.updated", thread_id: T, recipient_id: A });
  await ui.advance(750);
  assert.equal(ui.run("state.currentCache.peerLastReadSeq"), 4);
  assert.equal(ui.calls.length, 2);
});

test("refresh users adds accounts, preserves group/member choices and conversation/E2EE state", async () => {
  const refreshed = [{ id: A, username: "alice" }, { id: B, username: "bob" }, { id: OFFLINE, username: "new account" }];
  const second = deferred();
  const ui = frontendFixture((call) => {
    assert.equal(call.url, "/users");
    return ui.calls.length === 2 ? second.promise : apiResponse(refreshed);
  });
  await ui.run("loadUsers()");
  ui.nodes.get("group-users").querySelectorAll("*").find((node) => node.tag === "input" && node.value === B).checked = true;
  ui.nodes.get("group-name").value = "unfinished group";
  ui.nodes.get("members-panel").hidden = false;
  ui.run(`state.currentCache.members = [fixtureUsers[0]]; state.currentCache.membersDirty = false;
    state.currentCache.pendingSend = { messageID: "preserved-pending", content: "preserved draft", inFlight: false };
    state.currentCache.draftContent = "preserved draft"; contentInput.value = "preserved draft";
    renderMembers(state.currentCache);`);
  ui.nodes.get("add-member-user").value = B;
  const cache = ui.run("state.currentCache"), client = ui.run("state.e2ee"), pending = cache.pendingSend;
  ui.run('MiniHermesE2EEClient.create = () => { throw new Error("user refresh must not restart E2EE"); };');
  const refresh = ui.refresh();
  assert.equal(ui.nodes.get("refresh-users-button").disabled, true);
  await ui.refresh();
  assert.equal(ui.calls.length, 2, "concurrent clicks must not create more user requests");
  second.resolve(apiResponse([...refreshed, { id: "55555555-5555-4555-8555-555555555555", username: "latest account" }]));
  await refresh;
  assert.equal(ui.nodes.get("refresh-users-button").disabled, false);
  assert.equal(ui.nodes.get("peer-list").children.some((button) => button.textContent === "latest account"), true);
  assert.equal(ui.nodes.get("group-users").querySelectorAll("input:checked")[0].value, B);
  assert.equal(ui.nodes.get("add-member-user").value, B);
  assert.equal(ui.nodes.get("add-member-user").options.some((option) => option.textContent === "latest account"), true);
  assert.equal(ui.nodes.get("group-name").value, "unfinished group");
  assert.equal(ui.nodes.get("content").value, "preserved draft");
  assert.equal(ui.run("state.currentCache"), cache);
  assert.equal(ui.run("state.currentCache.pendingSend"), pending);
  assert.equal(ui.run("state.e2ee"), client);
  assert.equal(ui.run("state.threadID"), T);
  assert.equal(ui.calls.every((call) => call.url === "/users"), true);
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.ok(html.indexOf('id="refresh-users-button"') < html.indexOf('id="new-direct-section"'),
    "refresh must stay available even when the new-direct section is hidden");
});

test("refresh remains available without peers and drops choices for removed users", async () => {
  let users = [{ id: A, username: "alice" }];
  const ui = frontendFixture(() => apiResponse(users));
  await ui.run("loadUsers()");
  assert.equal(ui.nodes.get("new-direct-section").hidden, true);
  assert.equal(ui.nodes.get("refresh-users-button").disabled, false);
  users = [...users, { id: B, username: "bob" }];
  await ui.refresh();
  assert.equal(ui.nodes.get("new-direct-section").hidden, false);
  assert.equal(ui.nodes.get("peer-list").children[0].textContent, "bob");
  ui.nodes.get("group-users").querySelectorAll("*").find((node) => node.tag === "input").checked = true;
  ui.nodes.get("members-panel").hidden = false;
  ui.run("state.currentCache.members = [fixtureUsers[0]]; renderMembers(state.currentCache);");
  ui.nodes.get("add-member-user").value = B;
  users = [{ id: A, username: "alice" }, { id: OFFLINE, username: "replacement peer" }];
  await ui.refresh();
  assert.equal(ui.nodes.get("group-users").querySelectorAll("input:checked").length, 0);
  assert.equal(ui.nodes.get("add-member-user").value, OFFLINE);
  assert.equal(ui.nodes.get("add-member-user").options.some((option) => option.value === B), false);
  assert.equal(ui.calls.every((call) => call.url === "/users"), true);
});

test("user refresh errors restore its button and obsolete responses cannot change a new session", async () => {
  const failure = frontendFixture(() => apiResponse({ error: "users unavailable" }, 503));
  await failure.refresh();
  assert.equal(failure.nodes.get("refresh-users-button").disabled, false);
  assert.equal(failure.run("state.usersRequest"), null);

  const old = deferred(), fresh = deferred();
  const ui = frontendFixture(() => ui.calls.length === 1 ? old.promise : fresh.promise);
  const oldRequest = ui.refresh();
  ui.run(`clearSession(); state.token = "new-user-token"; state.currentUserID = "${B}";
    state.currentUsername = "bob"; state.users = [{ id: "${B}", username: "bob" }];`);
  assert.equal(ui.nodes.get("refresh-users-button").disabled, false);
  const newRequest = ui.refresh();
  old.resolve(apiResponse([{ id: A, username: "old alice" }]));
  await oldRequest;
  assert.equal(ui.nodes.get("refresh-users-button").disabled, true,
    "old completion may not enable the button during the new session's active refresh");
  assert.equal(ui.run("state.currentUsername"), "bob");
  assert.equal(ui.run("state.users[0].id"), B);
  fresh.resolve(apiResponse([{ id: B, username: "new bob" }, { id: OFFLINE, username: "new peer" }]));
  await newRequest;
  assert.equal(ui.nodes.get("refresh-users-button").disabled, false);
  assert.equal(ui.run("state.currentUsername"), "new bob");
  assert.equal(ui.nodes.get("peer-list").children[0].textContent, "new peer");
});

test("real HTTP/Redis/WebSocket round trip and password-only history recovery", {
  skip: !process.env.CHAT_API_TEST_URL, timeout: 300000,
}, async () => {
  const base = process.env.CHAT_API_TEST_URL.replace(/\/$/, "");
  const suffix = Date.now().toString(36);
  const password = "fetest account password 2026!";
  const sockets = [], clients = [];
  const calls = [];
  async function call(url, options = {}, token) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", "Bearer " + token);
    if (options.body) headers.set("Content-Type", "application/json");
    calls.push({ url, body: options.body });
    const response = await nativeFetch(base + url, { ...options, headers });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error("API " + response.status + " " + (options.method || "GET") + " " + url),
      { status: response.status, details: body });
    return body;
  }
  async function register(name) {
    const username = "fetest_" + suffix + "_" + name;
    const account = await MiniHermesE2EEClient.createAccount(username, password);
    await call("/auth/register", { method: "POST", body: JSON.stringify({
      username, auth_credential: account.auth_credential, kdf: account.kdf,
      public_bundle: account.public_bundle, account_vault: account.account_vault }) });
    return username;
  }
  async function login(username) {
    const params = await call("/auth/params?username=" + encodeURIComponent(username));
    const credential = await MiniHermesE2EEClient.deriveCredentials(username, password, params.kdf);
    const login = await call("/auth/login", { method: "POST",
      body: JSON.stringify({ username, auth_credential: credential.auth_credential }) });
    const request = (url, options) => call(url, options, login.access_token);
    const client = MiniHermesE2EEClient.create({ apiURL: base, userID: login.user_id, username,
      vaultKey: credential.vault_key, request });
    clients.push(client);
    await client.start();
    return { client, request, id: login.user_id };
  }
  async function connect(actor) {
    const ticket = await actor.request("/auth/ws-ticket", { method: "POST" });
    const url = new URL(ticket.ws_url);
    url.searchParams.set("ticket", ticket.ticket);
    const socket = new WebSocket(url);
    sockets.push(socket);
    const events = [];
    socket.addEventListener("message", (event) => {
      try { const value = JSON.parse(event.data); if (value.type === "message.created") events.push(value); } catch (_) {}
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("gateway connect timeout")), 5000);
      socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("gateway connect failed")); }, { once: true });
    });
    return events;
  }
  async function eventFor(events, id) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const value = events.find((event) => event.message_id === id);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("gateway message delivery timeout");
  }
  try {
    const aliceName = await register("a"), bobName = await register("b"), offlineName = await register("c");
    const a1 = await login(aliceName), a2 = await login(aliceName), b1 = await login(bobName);
    const [eventsA1, eventsA2, eventsB] = await Promise.all([connect(a1), connect(a2), connect(b1)]);
    const thread = await a1.request("/threads/direct", { method: "POST", body: JSON.stringify({ peer_id: b1.id }) });
    const ab = { id: thread.id, kind: "direct", peer: { id: b1.id } };
    const ba = { id: thread.id, kind: "direct", peer: { id: a1.id } };
    const [sent, replied] = await Promise.all([a1.client.send(ab, "real A first"), b1.client.send(ba, "real B first")]);
    assert.ok(JSON.parse(sent.content).epoch_id === JSON.parse(replied.content).epoch_id);
    const epochs = await a1.request("/threads/" + thread.id + "/epochs");
    assert.equal(epochs.epochs.length, 1);
    const senderCopy = await eventFor(eventsA2, sent.id);
    assert.ok(senderCopy.recipient_id === a1.id);
    assert.equal((await a2.client.receive(ab, senderCopy)).plaintext, "real A first");
    assert.equal((await b1.client.receive(ba, await eventFor(eventsB, sent.id))).plaintext, "real A first");
    assert.equal((await a1.client.receive(ab, await eventFor(eventsA1, replied.id))).plaintext, "real B first");
    await Promise.all([a1.client.send(ab, "real device one"), a2.client.send(ab, "real device two")]);
    assert.equal((await a1.request("/threads/" + thread.id + "/epochs")).epochs.length, 1);

    // C has never unlocked the account or accepted an epoch before its first message.
    const users = await a1.request("/users");
    const offlineID = users.find((user) => user.username === offlineName).id;
    const ac = await a1.request("/threads/direct", { method: "POST", body: JSON.stringify({ peer_id: offlineID }) });
    const offlineMessage = await a1.client.send({ id: ac.id, kind: "direct", peer: { id: offlineID } }, "real offline recipient");
    localStorage.clear();
    const cFresh = await login(offlineName);
    const ca = { id: ac.id, kind: "direct", peer: { id: a1.id } };
    const cHistory = await cFresh.request("/threads/" + ac.id + "/messages?limit=100");
    assert.equal((await cFresh.client.receive(ca, cHistory.messages.find((message) => message.id === offlineMessage.id))).plaintext,
      "real offline recipient");

    const competing = await proposeSession(b1.client, ba);
    await assert.rejects(() => b1.request("/threads/" + thread.id + "/epochs", {
      method: "POST", body: JSON.stringify(competing) }),
    (error) => error.status === 409 && error.details.epoch.epoch_id === epochs.current_epoch_id);
    const newest = await b1.client.send(ba, "real same session");
    assert.equal(JSON.parse(newest.content).epoch_id, epochs.current_epoch_id);
    localStorage.clear();
    const aFresh = await login(aliceName);
    const history = await aFresh.request("/threads/" + thread.id + "/messages?limit=100");
    for (const message of history.messages) {
      const view = await aFresh.client.receive(ab, message);
      assert.ok(view.status === "ready", "fresh browser must read both directions using the restored session");
    }
    assert.ok(history.messages.some((message) => message.id === newest.id));
    assert.equal((await aFresh.request("/threads/" + thread.id + "/epochs")).epochs.length, 1);
    const claimsBeforeResume = calls.filter((item) => item.url.endsWith("/claim")).length;
    const resumed = await aFresh.client.send(ab, "real fresh device same session");
    assert.equal(JSON.parse(resumed.content).epoch_id, epochs.current_epoch_id);
    assert.equal(calls.filter((item) => item.url.endsWith("/claim")).length, claimsBeforeResume);

    const group = await a1.request("/threads/group", { method: "POST",
      body: JSON.stringify({ name: "fetest group", member_ids: [b1.id] }) });
    const groupMessage = await a1.request("/threads/" + group.id + "/messages", { method: "POST",
      body: JSON.stringify({ message_id: crypto.randomUUID(), content: "real group plaintext" }) });
    assert.equal(groupMessage.content_format, "plaintext");
    assert.equal(groupMessage.content, "real group plaintext");
    const groupHistory = await b1.request("/threads/" + group.id + "/messages?limit=100");
    assert.ok(groupHistory.messages.some((message) => message.id === groupMessage.id && message.content === "real group plaintext"));
    assert.ok((await eventFor(eventsA2, groupMessage.id)).recipient_id === a1.id);
    assert.equal(JSON.stringify(calls).includes(password), false);
    assert.equal(calls.some((item) => item.body?.includes('"vault_key"')), false);
  } finally {
    for (const socket of sockets) socket.close();
    await Promise.all(clients.map((client) => client.close()));
  }
});
