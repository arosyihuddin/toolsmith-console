interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface Env {
  DB: { prepare(sql: string): D1StatementLike; batch<T = unknown>(statements: D1StatementLike[]): Promise<Array<{ meta: { changes: number }; results?: T[] }>> };
  ASSETS: { fetch(request: Request): Promise<Response> };
  OMP_ADMIN_RECOVERY_TOKEN?: string;
}
type InstanceRow = {
  id: string;
  name: string;
  base_url: string;
  status: string;
  version: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};
const COOKIE = "omp_control_session";
const PASSWORD_ITERATIONS = 100000;
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
  });
const fail = (code: string, message: string, status = 400) =>
  json({ error: { code, message } }, status, { "cache-control": "no-store" });
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const hex = (value: ArrayBuffer) =>
  [...new Uint8Array(value)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
const hash = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
async function recoveryTokenMatches(provided: string, configured: string): Promise<boolean> {
  const a = await hash(provided), b = await hash(configured);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function tokenFrom(req: Request) {
  const part = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="));
  if (!part) return null;
  try {
    return decodeURIComponent(part.slice(COOKIE.length + 1));
  } catch {
    return null;
  }
}
function secure(req: Request) {
  try {
    return new URL(req.headers.get("origin") ?? req.url).protocol === "https:";
  } catch {
    return false;
  }
}
function cookie(token: string, age: number, req: Request) {
  return (
    COOKIE +
    "=" +
    encodeURIComponent(token) +
    "; Path=/control; HttpOnly; SameSite=Strict; Max-Age=" +
    age +
    (secure(req) ? "; Secure" : "")
  );
}
async function passwordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return "pbkdf2$" + PASSWORD_ITERATIONS + "$" + hex(salt.buffer) + "$" + hex(bits);
}
async function passwordVerify(password: string, stored: string) {
  try {
    const [kind, iterations, saltHex, want] = stored.split("$");
    const rounds = Number(iterations);
    if (kind !== "pbkdf2" || !Number.isInteger(rounds) || rounds < 1 || rounds > PASSWORD_ITERATIONS || !saltHex || !want) return false;
    const salt = new Uint8Array(
      saltHex.match(/.{2}/g)!.map((v) => parseInt(v, 16)),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const got = hex(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt,
          iterations: rounds,
        },
        key,
        256,
      ),
    );
    return (
      got.length === want.length &&
      [...got].reduce(
        (n, c, i) => n | (c.charCodeAt(0) ^ want[i].charCodeAt(0)),
        0,
      ) === 0
    );
  } catch {
    return false;
  }
}
async function authenticated(req: Request, env: Env) {
  const token = tokenFrom(req);
  if (!token) return false;
  return !!(await env.DB.prepare(
    "SELECT token_hash FROM auth_sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(token), Date.now())
    .first());
}
async function body(req: Request) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}
function validateBase(value: unknown) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("baseUrl is required");
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "baseUrl must be HTTP(S) without credentials, query, or fragment",
    );
  if (url.protocol !== "https:")
    throw new Error("HTTPS is required for Cloudflare Workers instances");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host.startsWith("[")
  )
    throw new Error(
      "Local, private, and IP-literal hosts are not supported for Cloudflare Workers instances",
    );
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const octets = host.split(".").map(Number);
    if (
      octets.some((n) => n > 255) ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      octets[0] >= 224
    )
      throw new Error("Private or reserved IP addresses are not supported");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}
function safeName(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw new Error("name must contain 1–80 characters");
  return value.trim();
}

async function testConnection(baseUrlValue: unknown, credentialValue: unknown) {
  const started = Date.now();
  const checkedAt = now();
  try {
    const credential = typeof credentialValue === "string" ? credentialValue.trim() : "";
    if (!credential) throw new Error("Bearer token is required");
    if (credential.length > 4096) throw new Error("credential is too long");
    const target = validateBase(baseUrlValue);
    target.pathname = (target.pathname + "/api/dashboard").replace(/\/+/g, "/");
    const response = await fetch(target, {
      headers: { accept: "application/json", authorization: "Bearer " + credential },
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });
    if (!response.ok) throw new Error("Runtime returned HTTP " + response.status);
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error("Runtime did not return a JSON dashboard response");
    await response.json();
    return json({ status: "online", checkedAt, latencyMs: Date.now() - started });
  } catch (e) {
    return fail("CONNECTION_FAILED", e instanceof Error ? e.message : "Connection test failed", 502);
  }
}
function pub(r: InstanceRow) {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    status: r.status,
    ...(r.version ? { version: r.version } : {}),
    ...(r.last_seen_at ? { lastSeenAt: r.last_seen_at } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
async function instance(env: Env, id: string) {
  return env.DB.prepare(
    "SELECT id,name,base_url,credential,status,version,last_seen_at,created_at,updated_at FROM instances WHERE id=?",
  )
    .bind(id)
    .first<any>();
}
const exact: Record<string, string[]> = {
  "/api/dashboard": ["GET"],
  "/api/events": ["GET"],
  "/api/processes": ["GET"],
  "/api/tunnels": ["GET", "POST"],
  "/api/tunnels/status": ["GET"],
  "/api/tunnels/events": ["GET"],
  "/api/models": ["GET"],
  "/api/omp/config": ["GET", "PUT"],
  "/api/omp/config/reset": ["POST"],
  "/api/terminals": ["GET", "POST"],
  "/api/tools": ["GET"],
  "/api/root-commands": ["GET", "PUT"],
  "/api/root-commands/password": ["PUT"],
  "/api/logs": ["GET"],
  "/api/approvals": ["GET"],
  "/api/approvals/clear": ["POST"],
  "/api/profile": ["GET", "PUT"],
  "/api/workspace": ["GET", "DELETE"],
  "/api/workspace/state": ["GET"],
  "/api/workspace/pins": ["POST", "DELETE"],
  "/api/workspace/pins/order": ["PUT"],
  "/api/workspace/favorites": ["POST", "DELETE"],
  "/api/workspace/recents": ["POST", "DELETE"],
  "/api/workspace/prefs": ["PUT"],
  "/api/workspace/editor-session": ["GET", "PUT"],
  "/api/workspace/git-status": ["GET"],
  "/api/workspace/git-diff": ["GET"],
  "/api/workspace/file": ["GET", "PUT"],
  "/api/workspace/preview": ["GET"],
  "/api/workspace/download": ["GET"],
  "/api/workspace/stat": ["GET"],
  "/api/workspace/create": ["POST"],
  "/api/workspace/rename": ["POST"],
  "/api/workspace/duplicate": ["POST"],
  "/api/workspace/move": ["POST"],
};
function allowed(path: string, method: string) {
  if (exact[path]?.includes(method)) return true;
  if (/^\/api\/terminals\/[^/]+$/.test(path)) return method === "DELETE";
  if (/^\/api\/processes\/[^/]+$/.test(path)) return method === "DELETE";
  if (/^\/api\/tunnels\/[^/]+$/.test(path)) return method === "GET";
  if (/^\/api\/tunnels\/[^/]+\/logs$/.test(path)) return method === "GET";
  if (/^\/api\/tunnels\/[^/]+\/stop$/.test(path)) return method === "POST" || method === "DELETE";
  if (/^\/api\/tools\/[^/]+$/.test(path)) return method === "PATCH";
  if (/^\/api\/approvals\/[^/]+\/(approve|deny)$/.test(path))
    return method === "POST";
  if (path === "/api/sessions") return method === "POST";
  return (
    /^\/api\/sessions\/[^/]+\/(interrupt|dispose|resume)$/.test(path) &&
    method === "POST"
  );
}
async function proxy(
  req: Request,
  env: Env,
  id: string,
  path: string,
  incoming: URL,
) {
  const row = await instance(env, id);
  if (!row) return fail("NOT_FOUND", "Instance not found", 404);
  if (
    !path.startsWith("/api/") ||
    path.includes("\\") ||
    /%2f|%5c/i.test(path) ||
    path.split("/").includes("..")
  )
    return fail("INVALID_RUNTIME_PATH", "Invalid runtime path", 400);
  if (!allowed(path, req.method))
    return fail(
      "RUNTIME_ROUTE_NOT_ALLOWED",
      "This runtime route or method is not allowed",
      403,
    );
  try {
    const target = validateBase(row.base_url);
    target.pathname = (target.pathname + path).replace(/\/+/g, "/");
    target.search = incoming.search;
    const headers = new Headers();
    for (const k of [
      "accept",
      "content-type",
      "range",
      "if-none-match",
      "if-modified-since",
    ]) {
      const v = req.headers.get(k);
      if (v) headers.set(k, v);
    }
    if (row.credential)
      headers.set("authorization", "Bearer " + row.credential);
    const init: RequestInit = {
      method: req.method,
      headers,
      // Cloudflare Workers supports only "follow" and "manual".
      // Keep redirects blocked so runtime URLs cannot redirect the proxy elsewhere.
      redirect: "manual",
    };
    if (req.method !== "GET" && req.method !== "HEAD")
      init.body = await req.arrayBuffer();
    if (path !== "/api/events" && path !== "/api/tunnels/events") init.signal = AbortSignal.timeout(15000);
    const upstream = await fetch(target, init);
    if (upstream.status >= 300 && upstream.status < 400) {
      return fail(
        "RUNTIME_REDIRECT_BLOCKED",
        "The runtime endpoint returned a redirect. Configure the instance with its final URL.",
        502,
      );
    }
    const out = new Headers();
    for (const k of [
      "content-type",
      "cache-control",
      "content-disposition",
      "etag",
      "last-modified",
      "accept-ranges",
      "content-range",
    ]) {
      const v = upstream.headers.get(k);
      if (v) out.set(k, v);
    }
    if (path === "/api/events" || path === "/api/tunnels/events") {
      out.set("content-type", "text/event-stream; charset=utf-8");
      out.set("cache-control", "no-cache, no-store, must-revalidate");
      out.set("x-accel-buffering", "no");
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (e) {
    return fail(
      "RUNTIME_UNAVAILABLE",
      e instanceof Error ? e.message : "Runtime request failed",
      502,
    );
  }
}
async function websocketProxy(req: Request, env: Env, id: string, url: URL) {
  const row = await instance(env, id);
  if (!row) return fail("NOT_FOUND", "Instance not found", 404);
  try {
    const target = validateBase(row.base_url);
    target.protocol = target.protocol === "https:" ? "https:" : "http:";
    target.pathname = (target.pathname + "/api/terminal/socket").replace(
      /\/+/g,
      "/",
    );
    target.search = url.search;
    const headers = new Headers({ Upgrade: "websocket" });
    if (row.credential) headers.set("authorization", "Bearer " + row.credential);
    const response = await fetch(target, { headers });
    const upstream = (response as Response & { webSocket?: WebSocket })
      .webSocket;
    if (!upstream)
      return fail(
        "RUNTIME_UNAVAILABLE",
        "Runtime did not accept WebSocket upgrade",
        502,
      );
    const Pair = (globalThis as any).WebSocketPair;
    const pair = new Pair();
    const client = pair[0] as WebSocket,
      server = pair[1] as WebSocket;
    (server as any).accept();
    (upstream as any).accept();
    server.addEventListener("message", (e: MessageEvent) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(e.data);
    });
    upstream.addEventListener("message", (e: MessageEvent) => {
      if (server.readyState === WebSocket.OPEN) server.send(e.data);
    });
    server.addEventListener("close", () => upstream.close());
    upstream.addEventListener("close", () => server.close());
    server.addEventListener("error", () => upstream.close());
    upstream.addEventListener("error", () => server.close());
    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket });
  } catch (e) {
    return fail(
      "RUNTIME_UNAVAILABLE",
      e instanceof Error ? e.message : "Unable to connect terminal",
      502,
    );
  }
}
async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/healthz")
    return json({
      status: "ok",
      service: "omp-control",
      runtime: "cloudflare-workers",
    });
  if (!url.pathname.startsWith("/control/v1/")) return env.ASSETS.fetch(req);
  try {
    const path = url.pathname;
    if (path === "/control/v1/auth/status" && req.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM auth_users",
      ).first<{ count: number }>();
      const token = tokenFrom(req);
      const user = token ? await env.DB.prepare(
        "SELECT u.username FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      ).bind(await hash(token), Date.now()).first<{ username: string }>() : null;
      return json({
        configured: (row?.count ?? 0) > 0,
        authenticated: !!user,
        username: user?.username ?? null,
      });
    }
    if (path === "/control/v1/auth/setup" && req.method === "POST") {
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM auth_users",
      ).first<{ count: number }>();
      if ((count?.count ?? 0) > 0)
        return fail(
          "ALREADY_CONFIGURED",
          "An account has already been created",
          409,
        );
      const b = await body(req),
        username =
          typeof b.username === "string" ? b.username.trim().toLowerCase() : "",
        password = typeof b.password === "string" ? b.password : "";
      if (!/^[a-z0-9._-]{3,64}$/.test(username))
        return fail(
          "INVALID_USERNAME",
          "Username must be 3–64 characters and use letters, numbers, dots, underscores, or hyphens",
        );
      if (password.length < 12 || password.length > 1024)
        return fail(
          "INVALID_PASSWORD",
          "Password must be between 12 and 1024 characters",
        );
      const id = uuid(),
        token = uuid() + uuid(),
        created = now(),
        stored = await passwordHash(password);
      const inserted = await env.DB.prepare(
        "INSERT INTO auth_users (id,username,password_hash,created_at) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM auth_users)",
      )
        .bind(id, username, stored, created)
        .run();
      if (!inserted.meta.changes)
        return fail(
          "ALREADY_CONFIGURED",
          "An account has already been created",
          409,
        );
      await env.DB.prepare(
        "INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
      )
        .bind(await hash(token), id, Date.now() + 2592000000)
        .run();
      return json({ authenticated: true, username }, 201, {
        "set-cookie": cookie(token, 2592000, req),
      });
    }
    if (path === "/control/v1/auth/login" && req.method === "POST") {
      const b = await body(req),
        username =
          typeof b.username === "string" ? b.username.trim().toLowerCase() : "",
        password = typeof b.password === "string" ? b.password : "",
        user = await env.DB.prepare(
          "SELECT id,username,password_hash FROM auth_users WHERE username=?",
        )
          .bind(username)
          .first<{ id: string; username: string; password_hash: string }>();
      if (!user || !(await passwordVerify(password, user.password_hash)))
        return fail(
          "INVALID_CREDENTIALS",
          "Username or password is incorrect",
          401,
        );
      const token = uuid() + uuid();
      await env.DB.prepare(
        "INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
      )
        .bind(await hash(token), user.id, Date.now() + 2592000000)
        .run();
      return json({ authenticated: true, username: user.username }, 200, {
        "set-cookie": cookie(token, 2592000, req),
      });
    }
    if (path === "/control/v1/auth/recovery/verify" && req.method === "POST") {
      const configured = env.OMP_ADMIN_RECOVERY_TOKEN ?? "";
      if (configured.length < 32) return fail("RECOVERY_UNAVAILABLE", "Pemulihan password belum dikonfigurasi dengan aman di server.", 503);
      const b = await body(req), supplied = typeof b.token === "string" ? b.token : "";
      const ip = req.headers.get("cf-connecting-ip") ?? "unknown", ipHash = await hash(ip), timestamp = Date.now();
      const attempt = await env.DB.prepare("SELECT attempts,window_started_at,blocked_until FROM auth_recovery_attempts WHERE ip_hash=?").bind(ipHash).first<{ attempts: number; window_started_at: number; blocked_until: number }>();
      if (attempt?.blocked_until && attempt.blocked_until > timestamp) return fail("RECOVERY_RATE_LIMITED", "Terlalu banyak percobaan. Coba lagi dalam 15 menit.", 429);
      const expiredWindow = !attempt || timestamp - attempt.window_started_at >= 900000;
      if (!expiredWindow && attempt.attempts >= 5) return fail("RECOVERY_RATE_LIMITED", "Terlalu banyak percobaan. Coba lagi dalam 15 menit.", 429);
      if (!supplied || supplied.length > 4096 || !(await recoveryTokenMatches(supplied, configured))) {
        const attempts = expiredWindow ? 1 : attempt.attempts + 1;
        await env.DB.prepare("INSERT INTO auth_recovery_attempts (ip_hash,attempts,window_started_at,blocked_until) VALUES (?,?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=excluded.attempts,window_started_at=excluded.window_started_at,blocked_until=excluded.blocked_until").bind(ipHash, attempts, expiredWindow ? timestamp : attempt.window_started_at, attempts >= 5 ? timestamp + 900000 : 0).run();
        return fail("INVALID_RECOVERY_TOKEN", "Recovery token tidak valid.", 401);
      }
      await env.DB.prepare("DELETE FROM auth_recovery_challenges WHERE expires_at<=?").bind(timestamp).run();
      const challenge = uuid() + uuid();
      await env.DB.prepare("INSERT INTO auth_recovery_challenges (token_hash,expires_at) VALUES (?,?)").bind(await hash(challenge), timestamp + 300000).run();
      await env.DB.prepare("DELETE FROM auth_recovery_attempts WHERE ip_hash=?").bind(ipHash).run();
      return json({ verified: true, challenge, expiresIn: 300 });
    }
    if (path === "/control/v1/auth/recovery/reset" && req.method === "POST") {
      const b = await body(req), challenge = typeof b.challenge === "string" ? b.challenge : "", password = typeof b.password === "string" ? b.password : "";
      if (!challenge || challenge.length > 256) return fail("INVALID_RECOVERY_CHALLENGE", "Sesi pemulihan tidak valid atau sudah kedaluwarsa.", 401);
      if (password.length < 8 || password.length > 1024) return fail("INVALID_PASSWORD", "Password harus terdiri dari 8–1024 karakter.");
      const challengeHash = await hash(challenge), timestamp = Date.now();
      const user = await env.DB.prepare("SELECT id FROM auth_users ORDER BY created_at LIMIT 1").first<{ id: string }>();
      if (!user) return fail("NOT_CONFIGURED", "Akun administrator belum dibuat.", 409);
      const newHash = await passwordHash(password);
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE auth_users SET password_hash=? WHERE id=? AND EXISTS (SELECT 1 FROM auth_recovery_challenges WHERE token_hash=? AND expires_at>?)").bind(newHash, user.id, challengeHash, timestamp),
        env.DB.prepare("DELETE FROM auth_recovery_challenges WHERE token_hash=? AND expires_at>? AND EXISTS (SELECT 1 FROM auth_users WHERE id=? AND password_hash=?)").bind(challengeHash, timestamp, user.id, newHash),
        env.DB.prepare("DELETE FROM auth_sessions WHERE EXISTS (SELECT 1 FROM auth_users WHERE id=? AND password_hash=?)").bind(user.id, newHash),
      ]);
      if (!results[0]?.meta.changes) return fail("INVALID_RECOVERY_CHALLENGE", "Sesi pemulihan tidak valid atau sudah kedaluwarsa.", 401);
      return json({ reset: true, message: "Password berhasil diubah. Silakan masuk kembali." });
    }
    if (path === "/control/v1/auth/logout" && req.method === "POST") {
      const token = tokenFrom(req);
      if (token)
        await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash=?")
          .bind(await hash(token))
          .run();
      return json({ authenticated: false }, 200, {
        "set-cookie": cookie("", 0, req),
      });
    }
    if (
      !path.startsWith("/control/v1/auth/") &&
      !(await authenticated(req, env))
    )
      return fail("UNAUTHENTICATED", "Please log in to continue", 401);
    if (path === "/control/v1/account/password" && req.method === "POST") {
      const token = tokenFrom(req);
      const user = token ? await env.DB.prepare("SELECT u.id,u.password_hash FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await hash(token), Date.now()).first<{ id: string; password_hash: string }>() : null;
      if (!user) return fail("UNAUTHENTICATED", "Please log in to continue", 401);
      const b = await body(req), current = typeof b.currentPassword === "string" ? b.currentPassword : "", next = typeof b.newPassword === "string" ? b.newPassword : "";
      if (!current || !(await passwordVerify(current, user.password_hash))) return fail("INVALID_CURRENT_PASSWORD", "Password saat ini tidak benar.", 400);
      if (next.length < 8 || next.length > 1024) return fail("INVALID_PASSWORD", "Password baru harus terdiri dari 8–1024 karakter.");
      if (current === next) return fail("PASSWORD_UNCHANGED", "Password baru harus berbeda dari password saat ini.");
      const stored = await passwordHash(next), replacement = uuid() + uuid();
      await env.DB.batch([env.DB.prepare("UPDATE auth_users SET password_hash=? WHERE id=?").bind(stored, user.id), env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(user.id), env.DB.prepare("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await hash(replacement), user.id, Date.now() + 2592000000)]);
      return json({ changed: true, message: "Password berhasil diubah." }, 200, { "set-cookie": cookie(replacement, 2592000, req) });
    }
    if (path === "/control/v1/account/password/recovery" && req.method === "POST") {
      const token = tokenFrom(req);
      const user = token ? await env.DB.prepare("SELECT u.id,u.password_hash FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await hash(token), Date.now()).first<{ id: string; password_hash: string }>() : null;
      if (!user) return fail("UNAUTHENTICATED", "Please log in to continue", 401);
      const b = await body(req), challenge = typeof b.challenge === "string" ? b.challenge : "", current = typeof b.currentPassword === "string" ? b.currentPassword : "", next = typeof b.newPassword === "string" ? b.newPassword : "";
      if (!challenge || challenge.length > 256) return fail("INVALID_RECOVERY_CHALLENGE", "Sesi pemulihan tidak valid atau kedaluwarsa.", 401);
      if (!current || !(await passwordVerify(current, user.password_hash))) return fail("INVALID_CURRENT_PASSWORD", "Password lama tidak benar.", 400);
      if (next.length < 8 || next.length > 1024) return fail("INVALID_PASSWORD", "Password baru harus terdiri dari 8–1024 karakter.");
      if (current === next) return fail("PASSWORD_UNCHANGED", "Password baru harus berbeda dari password lama.");
      const challengeHash = await hash(challenge), timestamp = Date.now(), stored = await passwordHash(next), replacement = uuid() + uuid();
      const valid = await env.DB.prepare("SELECT token_hash FROM auth_recovery_challenges WHERE token_hash=? AND expires_at>?").bind(challengeHash, timestamp).first();
      if (!valid) return fail("INVALID_RECOVERY_CHALLENGE", "Sesi pemulihan tidak valid atau kedaluwarsa.", 401);
      await env.DB.batch([env.DB.prepare("DELETE FROM auth_recovery_challenges WHERE token_hash=? AND expires_at>?").bind(challengeHash, timestamp), env.DB.prepare("UPDATE auth_users SET password_hash=? WHERE id=?").bind(stored, user.id), env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(user.id), env.DB.prepare("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await hash(replacement), user.id, timestamp + 2592000000)]);
      return json({ changed: true, message: "Password berhasil diubah." }, 200, { "set-cookie": cookie(replacement, 2592000, req) });
    }
    const runtime = url.pathname.match(
      /^\/control\/v1\/instances\/([^/]+)\/runtime(\/.*)$/,
    );
    if (runtime) {
      const id = decodeURIComponent(runtime[1]);
      if (
        runtime[2] === "/api/terminal/socket" &&
        req.headers.get("upgrade")?.toLowerCase() === "websocket"
      )
        return websocketProxy(req, env, id, url);
      return proxy(req, env, id, runtime[2], url);
    }

    if (path === "/control/v1/instances" && req.method === "GET") {
      const { results = [] } = await env.DB.prepare(
        "SELECT id,name,base_url,status,version,last_seen_at,created_at,updated_at FROM instances ORDER BY created_at DESC",
      ).all<InstanceRow>();
      return json({ instances: results.map(pub) });
    }
    if (path === "/control/v1/instances" && req.method === "POST") {
      const b = await body(req),
        name = safeName(b.name),
        base = validateBase(b.baseUrl).toString().replace(/\/$/, ""),
        credential = typeof b.credential === "string" ? b.credential.trim() : "";
      if (!credential) throw new Error("credential is required");
      if (credential.length > 4096) throw new Error("credential is too long");
      const tested = await testConnection(base, credential);
      if (!tested.ok) return tested;
      const { checkedAt } = await tested.json() as { checkedAt: string };
      const id = uuid();
      await env.DB.prepare(
        "INSERT INTO instances (id,name,base_url,credential,status,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,'online',?,?,?)",
      )
        .bind(id, name, base, credential, checkedAt, checkedAt, checkedAt)
        .run();
      return json({ instance: pub((await instance(env, id)) as InstanceRow) }, 201);
    }
    const match = path.match(
      /^\/control\/v1\/instances\/([^/]+)(?:\/(health-check))?$/,
    );
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (match[2] === "health-check" && req.method === "POST") {
        const row = await instance(env, id);
        if (!row) return fail("NOT_FOUND", "Instance not found", 404);
        const started = Date.now(),
          checkedAt = now();
        try {
          const target = validateBase(row.base_url);
          target.pathname = (target.pathname + "/api/dashboard").replace(
            /\/+/g,
            "/",
          );
          const headers = new Headers({ accept: "application/json" });
          if (row.credential)
            headers.set("authorization", "Bearer " + row.credential);
          const response = await fetch(target, {
            headers,
            signal: AbortSignal.timeout(4000),
            // Do not follow redirects, but use a mode supported by Workers.
            redirect: "manual",
          });
          if (!response.ok)
            throw new Error("Runtime returned HTTP " + response.status);
          await env.DB.prepare(
            "UPDATE instances SET status='online',last_seen_at=?,updated_at=? WHERE id=?",
          )
            .bind(checkedAt, checkedAt, id)
            .run();
          return json({
            status: "online",
            checkedAt,
            latencyMs: Date.now() - started,
          });
        } catch (e) {
          await env.DB.prepare(
            "UPDATE instances SET status='offline',updated_at=? WHERE id=?",
          )
            .bind(checkedAt, id)
            .run();
          return json({
            status: "offline",
            checkedAt,
            latencyMs: Date.now() - started,
            error: e instanceof Error ? e.message : "Health check failed",
          });
        }
      }
      if (!match[2] && req.method === "GET") {
        const row = await instance(env, id);
        return row
          ? json({ instance: pub(row as InstanceRow) })
          : fail("NOT_FOUND", "Instance not found", 404);
      }
      if (!match[2] && req.method === "PATCH") {
        const old = await instance(env, id);
        if (!old) return fail("NOT_FOUND", "Instance not found", 404);
        const b = await body(req),
          name = b.name === undefined ? old.name : safeName(b.name),
          base =
            b.baseUrl === undefined
              ? old.base_url
              : validateBase(b.baseUrl).toString().replace(/\/$/, ""),
          credential =
            b.credential === undefined
              ? old.credential
              : typeof b.credential === "string" && b.credential.trim()
                ? b.credential.trim()
                : null,
          t = now();
        await env.DB.prepare(
          "UPDATE instances SET name=?,base_url=?,credential=?,status='unknown',version=NULL,updated_at=? WHERE id=?",
        )
          .bind(name, base, credential, t, id)
          .run();
        return json({
          instance: pub((await instance(env, id)) as InstanceRow),
        });
      }
      if (!match[2] && req.method === "DELETE") {
        const result = await env.DB.prepare("DELETE FROM instances WHERE id=?")
          .bind(id)
          .run();
        return result.meta.changes
          ? new Response(null, { status: 204 })
          : fail("NOT_FOUND", "Instance not found", 404);
      }
    }
    return fail("NOT_FOUND", "Route not found", 404);
  } catch (e) {
    return fail(
      "INVALID_REQUEST",
      e instanceof Error ? e.message : "Request failed",
      400,
    );
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env);
  },
};
