# Inventory compact foundational slice

Synthetic populated Flutter captures, inspected after the exact focused checks. They contain no live customer, sales or stock data. Source screenshots supplied by the user remain in the local task evidence folder.

- [Overview composition](compact-overview-populated.png): production shared Inventory widgets with visible Sell/Create workflows and compact low-stock empty state.
- [Pending stock context](compact-pending-stock-context.png): actual pending overlay retains joined names; new tuples render explicit warehouse/unit identifier fallbacks.
- [Mounted fractional Overview](compact-overview-fractional-minimum.png): actual Overview page shows 2.5 / 2.5.
- [Scoped low-stock warnings](compact-stock-warnings.png): normal, finite low and unlimited rows; warning icon, threshold and warehouse/unit semantics.
- [Mounted Products page](compact-products-mounted.png): actual Products page using injected synthetic repositories; unlimited stock and scoped loaded-product count.
- [Phone at 200% text](compact-periods-large-text-320.png): intentionally scrolled populated stock rows and whole season panel.
- [Tablet at 200% text](compact-periods-large-text-768.png): populated product and visible season actions.

The screenshots use the existing bundled NotoSans and MaterialIcons fonts. The shared shell/dock is outside these content fixtures. They establish this slice's mounted component behavior, not full navigation, native OS back, live integration or permission coverage.

## Verification

Run from the repository root; the commands below enter `apps/mobile`.

```bash
cd apps/mobile
inventory_owned_files=(
  lib/data/repositories/inventory_pending_overlay.dart
  lib/features/inventory/view/inventory_manage_page.dart
  lib/features/inventory/view/inventory_page.dart
  lib/features/inventory/view/inventory_products_page.dart
  lib/features/inventory/view/inventory_sales_page.dart
  lib/features/inventory/widgets/inventory_ui.dart
  lib/features/inventory/widgets/inventory_sales_periods.dart
  lib/features/inventory/widgets/inventory_product_card.dart
  test/features/inventory/widgets/inventory_compact_test.dart
)
flutter gen-l10n
dart format "${inventory_owned_files[@]}"
flutter test --no-pub --concurrency=1 \
  test/features/inventory/widgets/inventory_ui_test.dart \
  test/features/inventory/widgets/inventory_sales_periods_test.dart \
  test/features/inventory/widgets/inventory_compact_test.dart
dart analyze --fatal-infos "${inventory_owned_files[@]}"
```

All ten tests passed; scoped analysis reported no issues. Donor pubspec/lock were byte-identical and donor package-config hashes stayed unchanged. Review correction tests: normal FIFO68116/runner68136/test68168, genuine success marker (10passed); explicit-type/style-only lint cleanup followed by FIFO75200/runner75202/analyzer75204 (No issues found). Pending fixture compile failures are preserved locally and excluded from passing proof. Semantics handles use try/finally. No install, local app build, live business-data write, backend grant change or shared shell edit occurred.

## Feature checklist and remaining gates

- Preserved dock destinations; removed duplicate Overview navigation tiles.
- Preserved Sell/Create, setup add actions, season selection/create/edit/archive, product rows, search/clear and pending frames.
- Rendered null stock as Unlimited; zero/negative/threshold quantities remain low stock. Quantities across units are not summed.
- Product metadata appears once, no duplicate first-price/aggregate-stock chips, no repeated catalog heading.
- Setup collections remain visible without the duplicate counter hero.
- Localized stock labels in English and Vietnamese and regenerated l10n.
- Next: shell action/search/filter/back/deep-link parity, read-only product details, honest partial setup errors.
- Next: authorized scoped aggregate analytics with currency/as-of/partial state and immutable sold-price snapshots; current legacy Overview hardcodes VND and loaded Sales revenue needs correction. This slice adds no analytics claims.
- Next: season effective-price native model/editor/atomic checkout integration (PR #5669 is on main; production not verified).
- Next: web stock ledger, batches/suppliers, bundles/options/import/export, costing/profit, promotions/revenue share, storefront expansion, commerce reservation lifecycle, providers/payments/POS. Existing native invoice checkout is not commerce parity.
- Required before integration: exact-head CI mobile checks/native build, full mounted shell/Back/navigation and permission/cache-switch checks. Root owns CI follow-through, merge, production and stores.

## Stock-health stack reconciliation

The fractional Overview capture was regenerated from the assembled #5700 UI
(base `0b25e7d20737719c2125180c830e328b4688345e` plus normal #5698 parent
`ac39902e71c1bc2abdf4fdcc452f5838e8ebc0dc`). The inherited mounted regression now
uses a synthetic authenticated actor and a synthetic stock-health response;
its `2.5 / 2.5`, rejected `2.5 / 3`, product-label and injected-repository
ownership assertions remain intact. No real API is used for this capture.
Combined focused suites passed **33 tests**; scoped fatal-info analysis passed.
The regenerated image was inspected and shows stock health plus the fractional
low-stock row. Pending-stock context evidence remains the parent owner's image.
Seasonal checkout implementation remains on a separate branch.
