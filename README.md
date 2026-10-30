# Toolsmith Console

Toolsmith Console is the standalone multi-instance dashboard and control plane for Toolsmith MCP servers. It provides the UI, instance registry, authentication, health checks, and an allowlisted proxy for runtime API, SSE, and terminal WebSocket traffic.

## Development

Requirements: Bun.

    bun install
    bun run dev

The development server uses port 5173 by default. The UI, control API, runtime proxy, SSE, and terminal WebSocket upgrade are handled by the same server. Configure instances in the setup/instance picker; the browser must not provide arbitrary upstream URLs.

## Deployment modes

- Bun/self-hosted: standalone SvelteKit server, local SQLite registry/auth database, and local cloudflared controls. Run bun run build and bun run start.
- Cloudflare Workers: static frontend plus the control API in cloudflare/worker.ts; registry and auth data use Cloudflare D1.

The existing Cloudflare D1 database is still named omp-control in the deployment configuration. This resource identifier is intentionally unchanged during the local branding pass; do not create or switch to a replacement database as part of a source rebrand.

## Security and API contract

- All control API and runtime proxy endpoints require an authenticated session; /healthz remains public.
- Instance credentials are stored server-side and excluded from instance responses.
- Instance base URLs must be HTTP(S), must not contain embedded credentials/query/fragment, and must use HTTPS except for loopback development instances. Health checks use a timeout and do not follow redirects.
- Browser clients must never supply arbitrary upstream URLs. Validate and store instance endpoints server-side to prevent SSRF and credential exposure.
- The backend is authoritative for tool catalog, exposure, permission, and approval decisions. Toolsmith Console only manages and displays those settings.
- Authenticated terminal WebSocket proxying and local cloudflared process management are not supported inside Workers; those capabilities depend on deployment mode.

## Related project

Toolsmith MCP is the runtime server that exposes native MCP tools and authenticated runtime/control APIs. This frontend lives in a separate repository and must be tested independently from the backend.

## Validation

    bun run check
    bun run build

Do not run remote D1 migrations or Worker deployments during local development validation. Commit and deploy only when explicitly authorized.
