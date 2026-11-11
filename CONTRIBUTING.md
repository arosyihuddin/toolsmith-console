# Contributing to Toolsmith Console

## Before changing code

1. Read `README.md` for setup and deployment instructions.
2. Read `ARCHITECTURE.md` to understand control-plane/runtime ownership.
3. Read `DESIGN.md` before changing UI styling or interaction patterns.
4. Read `docs/API_CONTRACT.md` before changing control-plane or proxy endpoints.
5. Check `git status --short` and preserve existing uncommitted work.

## Requirements and local development

- Bun (use the version expected by the repository and lockfile).

Typical local setup:

```bash
cp .env.example .env
bun install
bun run dev
```

The development command runs the SvelteKit UI and Bun-backed server together. Do not introduce a second API listener or a separate development shell script unless the architecture is deliberately changed.

## Validation

Run the checks relevant to the change:

```bash
bun run check
bun run build
git diff --check
```


## UI conventions

- Follow `DESIGN.md` and reuse existing components and semantic tokens.
- Check both light and dark themes.
- Implement clear hover, focus, selected, disabled, loading, empty, and error states where relevant.
- Ensure menus, dropdowns, and popovers are not clipped by cards or stacking contexts.
- Prefer accessible native semantics and keyboard behavior over custom controls when practical.
- Keep the existing page information architecture unless the task calls for a change.

## API and security conventions

- Validate input at the server boundary and return consistent JSON errors.
- Never accept arbitrary upstream URLs from the browser or expose instance credentials.
- Keep secrets out of source control, client state, and logs.
- Runtime tool catalog, exposure, and effective permission enforcement belong to Toolsmith. Do not create a competing tool catalog or treat UI state as a security boundary.
- Preserve SSE streaming and WebSocket behavior when modifying the proxy.

## Documentation

Update the relevant architecture, API contract, design guide, and README when behavior, routes, deployment requirements, or conventions change. Prefer documenting actual behavior over aspirational or unimplemented guarantees.
