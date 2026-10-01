# Inventory stock and setup scope correctness

Inspected synthetic Flutter captures after actual mounted editor Save and reload checks. No live product or customer data. The production fullscreen-modal flow and bundled NotoSans/MaterialIcons fonts are used; captures are scrolled to the stock row at390×1200.

- [Unlimited reload](editor-reload-unlimited.png): blank quantity preserved as null after unrelated name edit.
- [Zero reload](editor-reload-0.0.png): finite zero preserved.
- [Decimal reload](editor-reload-7.5.png): finite decimal preserved.

Ten focused tests passed: three actual editor validation/serialized PATCH/save/settings/cache-invalidation/modal-exit/reload cases, two existing editor lookup cases and five Manage deferred workspace/account/error/late-result/disposal/stale-sheet cases. Scoped fatal-info analysis reported no issues. Normal TTR FIFO17131, runner17133, tests17167, analyzer17229; donor dependencies remained unchanged. Earlier harness failures and lint failures are preserved in local evidence and are not accepted as successful proof.

The Save transport and cache store are synthetic. Tests assert workspace-scoped overview/catalog/audit invalidation and owner/category preferences, then remount the editor from the captured stock value. They do not prove persistent cache freshness, backend acceptance, offline replay, effective pricing, full shell/Back/deep links or production behavior. Existing editor preview currency is a separate parity gap. English/Vietnamese hint strings are generated; Vietnamese/large-text captures remain an integration gate.

No database, build, install, live stock write, backend grant change, shared shell edit or canonical membership filtering occurred. PR5696 owns the compact foundational presentation separately.
