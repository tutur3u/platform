# Inventory stock and setup scope correctness

Inspected synthetic Flutter captures after actual mounted editor Save and reload checks. No live product or customer data. The production fullscreen-modal flow and bundled NotoSans/MaterialIcons fonts are used; captures are scrolled to the stock row at390×1200.

- [Unlimited reload](editor-reload-unlimited.png): blank quantity preserved as null after unrelated name edit.
- [Finite to unlimited](editor-finite-to-unlimited.png): actual blank-field edit produces null repository payload and synthetic Unlimited reload.
- [Zero reload](editor-reload-0.0.png): finite zero preserved.
- [Decimal reload](editor-reload-7.5.png): finite decimal preserved.

Twelve focused tests passed: four mounted editor validation/repository-payload/save/settings/mock-cache-invalidation/modal-exit/synthetic-reload cases, one mounted invalid/negative/nonfinite input rejection case, two existing editor lookup cases and five Manage deferred workspace/account/error/late-result/disposal/stale-sheet cases. Scoped fatal-info analysis reported no issues. Boundary update: normal TTR FIFO85859, runner93190, tests93226 (12passed); one overlong test-name lint required a string-wrap-only follow-up (FIFO3796, runner5115, analyzer5198: No issues found). Original10-case pass: FIFO17131, runner17133, tests17167, analyzer17229; donor dependencies remained unchanged. Earlier harness failures and lint failures are preserved in local evidence and are not accepted as successful proof.

Tests run real repository payload construction into mocked ApiClient.patchJson and assert workspace-scoped overview/catalog/audit calls on mocked CacheStore.invalidateTags. They persist owner/category preferences in mocked SharedPreferences, then remount the editor from synthetic repository data derived from the captured stock value. Tests do not execute JSON encoding or HTTP. They do not prove persistent cache freshness, backend acceptance, offline replay, effective pricing, full shell/Back/deep links or production behavior. Existing editor preview currency is a separate parity gap. English/Vietnamese hint strings are generated; Vietnamese/large-text captures remain an integration gate.

No database, build, install, live stock write, backend grant change, shared shell edit or canonical membership filtering occurred. PR5696 owns the compact foundational presentation separately.
