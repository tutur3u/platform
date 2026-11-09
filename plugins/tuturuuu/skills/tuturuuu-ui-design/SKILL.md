---
name: tuturuuu-ui-design
description: Design, implement, or review Tuturuuu web UI using shared components, semantic tokens, responsive settings patterns, and explicit state coverage.
---

# Tuturuuu UI design

Read the repository's `apps/docs/build/development-tools/web-design-system.mdx`
before writing UI source. It owns the component map, token rules, state patterns,
reference screenshots, and UI review checklist. Its proposal and evidence status
apply: verify the merged settings stack before relying on new component contracts.
Do not copy unmerged settings code into another branch.

Use Khôi's settings design as the reference: one shell title, related settings in
sections, aligned rows, semantic contrast, and explicit recovery states. Preserve
behavior, permissions, validation, focus, and navigation while changing presentation.
Use `layout="stacked"` for wide content and the shared control-width scale for
compact controls. A row title does not replace an associated form label.

Model mutually exclusive UI states with one discriminated union, including idle,
loading, empty, error, success, disabled, and stale where reachable. Use exhaustive
rendering and explicit event transitions. Keep independent concurrent machines
separate. Read the guide example; do not replace valid query behavior with styling
booleans. Ask in review: are all states designed and reachable, and impossible
combinations unrepresentable?

Before adding a primitive, inspect `@tuturuuu/ui` and first-party callers. Keep
reusable styling and token definitions there. Avoid raw colors, arbitrary spacing,
nested cards, duplicate titles, and chevrons on non-collapsible labels.

Review the page checklist and render at 390px and 1440px in both themes. Exercise
loading, empty, error, pending, and permission states. Report missing evidence
explicitly. Source review and existing screenshots do not prove a new render.

For non-settings surfaces, reuse tokens and control/state patterns while preserving
the surface's own navigation and task structure. Flutter UI follows the mobile
design-system guidance rather than web components.
