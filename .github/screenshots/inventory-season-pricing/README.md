# Mobile scheduled-sale price evidence

This slice consumes existing effective-season prices and the atomic finance
invoice contract for **new scheduled sales**. It does not author prices, edit
scheduled sale history, or display revenue/profit. Ordinary creation retains its
existing path; historical matching lines use recorded prices.

## Contract and source

Source audit: `1987984c65dd37aff4ea545de894edbf76442d5e`. The audited period
GET/prices GET, atomic finance invoice, effective-price resolver, permissions and
inventory authorization source paths are unchanged from `7ff4f6b`. Presence on
main is not production migration evidence. Canonical membership remains
server-owned; Hidden preferences are not authorization.

The feature document is
`apps/docs/platform/features/inventory-season-pricing-mobile.mdx`. It records
period discovery's view-sales vs price GET's view/create-sales permission gap,
server as-of half-open quote resolution, IANA date eligibility, currency precision,
uncached reads, 15-second receipt freshness, online-only direct atomic POST,
immutable price IDs, exact request retry, and the current mounted-checkout-only
pending state. Process termination still requires operator reconciliation of an
uncertain sale. Financial aggregate contract gaps remain documented in the parent
stock-health correctness report; no unsupported financial chart is added.

## Focused proof

The assembled source normally includes exact #5700 parent
`5c1bdbd77e8acf37e0e78959c7f4df99368e30d7`, preserving #5698 cache/editor/Manage
assembly and its fractional Overview harness corrections.

- **20 focused tests passed**, with a genuine completed success marker.
- Scoped fatal-info analysis reported **No issues found**.
- The two status captures were repeated after a fixture-only MaterialIcons font
  load; both passed and fixture analysis was clean. Product code was unchanged.
- Captures use synthetic quotes and real Flutter rendering at 320/768 widths,
  1.5x text, NotoSans and MaterialIcons. Actual pixels were inspected. These
  show the compact status widget, not a full native checkout acceptance run.
- Shared dependency donor package-config hash remained unchanged; no installs,
  builds, DB fixture or real sales/catalog/customer writes occurred.
- The earlier interrupted screenshot run was explicitly invalidated despite a
  misleading zero shutdown exit. It is excluded from passing evidence. The
  corrected harness runs image/file IO in `tester.runAsync`; runners enforce
  process deadlines and require the completed test success marker.

The new model/controller/widget/repository modules remain within the 700-line
ceiling. Necessary checkout parts shrink the existing oversized page while
preserving its public import and ordinary sale method overrides. Root owns
exact-head CI, independent review, native checks, migration availability and any
future integration/deployment.
