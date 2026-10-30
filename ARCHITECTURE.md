# Toolsmith Console Architecture and Engineering Rules

This document defines frontend and control-plane implementation constraints. Toolsmith MCP remains authoritative for tool execution and permission decisions.

## Runtime boundaries

- SvelteKit pages and components render the dashboard and collect user intent.
- src/lib/api/ owns typed requests to the Console control API and selected runtime instance.
- The instance registry stores validated upstream URLs and credentials server-side. Browser code must never choose an arbitrary upstream URL for proxying.
- Authentication and control APIs run on the same listener as the UI in Bun mode; Cloudflare mode routes through cloudflare/worker.ts and D1.
- Runtime tool catalog, exposure, permission, custom-rule evaluation, and approvals remain owned by Toolsmith MCP. Do not duplicate enforcement in the UI.

## Security rules

1. Require authenticated sessions for control APIs and runtime proxy requests; preserve the public health endpoint only where intended.
2. Validate instance base URLs and reject embedded credentials, query strings, fragments, unsafe schemes, and non-loopback HTTP in production contexts. Do not follow redirects for health checks.
3. Store runtime credentials server-side; never return them from instance APIs or log them.
4. Use an allowlist for proxied API paths and methods. Do not expose a general-purpose URL proxy.
5. Treat API responses and user-provided text as untrusted. Escape rendered content and sanitize rendered Markdown/HTML.
6. Never treat a disabled UI button as a security boundary. Enforce permissions in Toolsmith MCP.

## State and compatibility

- Keep existing browser storage keys and custom event names stable unless a deliberate migration is implemented; they are used by multiple Console components.
- The Cloudflare D1 database identifier remains omp-control during this local rebrand. Do not rename the remote database or run remote migrations as part of source edits.
- Existing deployment URLs and credentials must continue to work while the runtime and Console are migrated separately.
- Do not overwrite unrelated working-tree changes, including terminal/workspace improvements and font asset changes.

## Validation workflow

Run locally:

    bun run check
    bun run build

Check self-hosted and Cloudflare builds separately when changing adapters or routing. Do not run remote D1 migrations, Worker deployment, or release targets during routine tests. Review git status and diff. Commit, publish, and deploy only with explicit authorization.
