# Toolsmith Console API contract (draft v1)

This contract describes the control-plane API shared by the Bun self-hosted server and the Cloudflare Workers deployment. Registry CRUD, health checks, first-admin setup, login/logout, and session authentication are implemented. The browser stores its active instance locally, and the runtime proxy uses an explicit route/method allowlist. Cloudflare mode stores registry and authentication data in D1; self-hosted mode uses local SQLite.

Base path: /control/v1

## Conventions

- JSON request and response bodies; timestamps are ISO 8601 UTC.
- All endpoints except health and the auth status/setup/login/logout routes require an authenticated session.
- Never accept an arbitrary upstream URL from a browser request. Instance URLs are registered and validated server-side.
- Instance credentials are server-side secrets and must never be returned by list/detail APIs.
- Errors use an object with error.code and error.message.

## Instance model

    type InstanceStatus = "unknown" | "online" | "degraded" | "offline";

    interface Instance {
      id: string;                 // stable UUID
      name: string;               // user-facing label
      baseUrl: string;            // validated server-side URL; never includes credentials
      status: InstanceStatus;     // latest observed health
      version?: string;
      lastSeenAt?: string;        // ISO 8601 UTC
      createdAt: string;
      updatedAt: string;
    }

Secrets are stored separately from this public representation. Do not expose them in API responses or logs.

## Endpoints

### List instances
GET /control/v1/instances

Response 200: object containing instances array.

### Register instance
POST /control/v1/instances

Request fields: name, baseUrl, credential (required write-only secret).

Before persistence, the control plane requests the remote `/api/dashboard` endpoint with the supplied Bearer token and a 5-second timeout. Only a successful JSON response is accepted.

Response 201: object containing an `online` instance with `lastSeenAt` set. The credential must never be echoed.

If the connection test fails, the request returns `502 CONNECTION_FAILED` and no instance is created.

Validation requirements:
- HTTPS required by default; permit HTTP only for explicit loopback/private-network development configuration.
- Reject URL credentials, unsupported schemes, fragments, and invalid ports.
- Protect against SSRF: validate DNS/IP ranges, block cloud metadata and unintended private destinations, and revalidate redirects/DNS at connection time.
- Apply timeouts and response-size limits to upstream calls.

### Get instance
GET /control/v1/instances/{instanceId}

Response 200: object containing instance.

### Update instance
PATCH /control/v1/instances/{instanceId}

Request may include name, baseUrl, or credential. Credentials remain write-only.
Response 200: object containing instance.

### Remove instance
DELETE /control/v1/instances/{instanceId}

Response 204. Removal deletes its stored credential and health record; it does not uninstall or modify the remote runtime.

### Check instance health
POST /control/v1/instances/{instanceId}/health-check

Response fields: status, checkedAt, latencyMs, optional runtimeVersion. Health checks run from the control-plane server using the registered instance configuration.

### Active instance
Active instance is initially a client preference. Persist it per user once authentication is implemented. Every instance-scoped operation must include an explicit instanceId in the control-plane route or request context.

### Proxy runtime APIs
/control/v1/instances/{instanceId}/runtime/{path}

Implemented as an explicit allowlist for supported REST endpoints and SSE forwarding. Terminal WebSocket forwarding is supported in Cloudflare mode only for instances without a bearer credential; authenticated WebSocket forwarding remains a limitation. Cloudflare Workers cannot spawn local cloudflared processes, so tunnel management is available only in self-hosted mode. No unrestricted generic proxy is exposed.

## Rollout sequence

1. Keep the copied UI working against a single instance through Vite proxy.
2. Implement instance registry persistence and CRUD on the control plane.
3. Add authenticated health checks and safe per-instance API routing.
4. Introduce active-instance state in the UI.
5. Migrate dashboard API calls to the control-plane routes.
6. Only then remove the legacy embedded dashboard from the Toolsmith runtime.
