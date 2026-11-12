# Calendar sidebar performance

The sidebar, unified connection picker, compact picker, and status control share
`calendar-connections-settings-lazy.tsx`. A status-only entrypoint can eagerly load
settings even when a sidebar dialog is closed. Preserve the lazy boundary across
all four consumers and forward their existing manager state. Provider operations
stay in their owning implementation.

Check package export targets before importing internal helpers: the calendar
component wildcard exports TSX modules, not internal TS hooks.

Use the synthetic fixture and measurement protocol in
[`apps/docs/build/development-tools/web-design-system.mdx`](../../../../../apps/docs/build/development-tools/web-design-system.mdx#calendar-settings-load-boundary).
Pin source, lockfile, viewport, cache protocol, and frame presentation for both
versions. Native preview can defer LCP presentation until a snapshot, so capture
one immediately after each navigation. Keep missing entries and failed renders
as unavailable evidence, not zero. Require the expected Calendar heading and no
Vite error overlay before interpreting module counts or LCP.

Capture grid geometry through hover expansion and collapse. A pinned-sidebar
toggle intentionally changes the grid width and validates the probe. Click-related
shifts can be excluded from CLS while remaining visible in raw shift entries.
Separate fixture metrics, module-graph reductions, and signed-in acceptance; a
smaller development graph alone does not prove better production LCP.

`calendar-connections-settings-lazy.test.tsx` verifies deferred loading, state
forwarding, and module reuse on reopening. The fixture uses synthetic service state;
it does not verify provider sync, auth, event reads, or production bundles.
