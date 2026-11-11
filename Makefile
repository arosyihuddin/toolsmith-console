export PATH := $(HOME)/.bun/bin:$(PATH)

.PHONY: help check build build-cloudflare release

help:
	@echo "Toolsmith Console targets"
	@echo "  make check                         Run Svelte and TypeScript checks"
	@echo "  make build                         Build the self-hosted Bun target"
	@echo "  make build-cloudflare              Build the Cloudflare Worker target"
	@echo "  make release VERSION=x.y.z         Validate, tag, and push a SemVer release"

check:
	bun run check

build:
	bun run build

build-cloudflare:
	bun run cf:build

release:
	@test -n "$(VERSION)" || { echo "Usage: make release VERSION=0.2.0"; exit 1; }
	@printf '%s\n' "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$$' || { echo "Invalid SemVer: $(VERSION)"; exit 1; }
	@test "$$(git branch --show-current)" = "main" || { echo "Release must be created from the main branch."; exit 1; }
	@test -z "$$(git status --porcelain)" || { echo "Git working tree must be clean before release."; exit 1; }
	@test -z "$$(git tag --list v$(VERSION))" || { echo "Git tag v$(VERSION) already exists."; exit 1; }
	@echo "[release] Validating source..."
	@$(MAKE) check
	@$(MAKE) build-cloudflare
	@git diff --check
	@echo "[release] Updating package.json to $(VERSION)..."
	@RELEASE_VERSION="$(VERSION)" bun -e 'const p=JSON.parse(await Bun.file("package.json").text()); p.version=process.env.RELEASE_VERSION; await Bun.write("package.json", JSON.stringify(p,null,2)+"\n");'
	@git diff --check
	@git add package.json
	@if ! git diff --cached --quiet; then git commit -m "chore: release v$(VERSION)"; else echo "[release] package.json already at $(VERSION), skipping release commit."; fi
	@git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	@git push origin main "v$(VERSION)"
	@echo "[release] ✓ v$(VERSION) released and pushed."
