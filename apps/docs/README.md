# Tuturuuu documentation

Start at [overview/start-here.mdx](overview/start-here.mdx). The product directory
and workflow guides explain use; source-derived references locate implementation
routes, packages, and checked-in dependency versions.

- `overview/`: onboarding, organization, and operating principles.
- `platform/applications/`: products and services; `platform/guides/`: user workflows.
- `platform/features/`, `architecture/`, `ai/`, `components/`, `personalization/`: behavior and implementation.
- `build/`: active development, SEO strategy, deployment, and operating runbooks.
- `learn/`: educational examples and experiments, explicitly separated from product guarantees.
- `reference/`: API contracts and generated `repository/` inventories.
- `docs.json`: navigation, redirects, site metadata, and assets.

Run `bun dev:docs` from the repository root for a local Mintlify preview; stop with
Ctrl+C. Node/Bun and the first CLI download are required. Docker setup is inactive,
the Docker cron runner is retired, and Rust/TanStack Start are paused. See
[active-runtime.mdx](build/devops/active-runtime.mdx) and
[without-docker.mdx](build/development-tools/without-docker.mdx).

After changing maintained routes or dependency manifests, run:

```bash
node scripts/generate-docs-inventory.js
node scripts/generate-app-seo.js
node scripts/docs-audit.js
node scripts/generate-docs-inventory.js --check
node scripts/generate-app-seo.js --check
```

Register every new page in `docs.json`; redirects can preserve retired URLs.
Write frontmatter with title/description and meaningful internal links. Document
permissions, defaults, affected surfaces, exceptions, and regression evidence.
Do not infer availability from a directory or claim deployed versions from a lockfile.
Keep historical Docker/migration pages explicitly inactive and do not refresh
paused runtime sources, manifests, or dependency versions until instructed.

CI `docs-seo-check.yaml` validates the inventory, links/navigation, SEO contracts,
and strict Mintlify compilation. Use focused non-build checks locally; app and
docs builds belong in CI. See [documenting.mdx](build/development-tools/documenting.mdx)
for contribution and reusable-learning requirements.
