# Mobile Inventory current stock health

Synthetic mounted panel captures at 320 and 768 logical pixels, 1.5x text size.
Both inspected after assembly on #5698. These show the stock-health panel only,
not the shared shell or a deployed native application. Values are synthetic.

The panel counts active products separately from stock rows. It explicitly
includes stock rows in archived warehouses, keeps overlapping low/out counts
separate, and preserves server generatedAt in UTC. It does not sum quantities
or display revenue/profit. Missing counts are partial; permission-denied refresh
clears the panel. Overview legacy money charts/amounts without currency are withheld.

Bounded FIFO verification completed: 21 tests (9 stock-health, 12 parent editor/
Manage correctness), scoped fatal-info analysis clean, Flutter localization
and scoped Dart format pass. Stock-health repository test executes the real read
method into a mocked ApiClient; mounted Overview uses a synthetic repository
subclass, and account/workspace streams are synthetic. No HTTP, persistent-cache,
DB fixtures or native runtime acceptance is proved. Parent correctness evidence
retains its own explicit mock-transport/cache boundaries.

[Phone](stock-health-320.png), [tablet](stock-health-768.png).
[Source-only financial correctness report](backend-analytics-correctness.md).
Product behavior and seasonal checkout boundaries are documented in
`apps/docs/platform/features/inventory-stock-health.mdx`.

Parent exact-head CI, independent review, native build and integration remain
required. This is a count-only analytics slice, not full web/mobile parity.
