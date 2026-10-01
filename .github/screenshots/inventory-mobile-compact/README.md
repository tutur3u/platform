# Inventory compact foundational slice

Synthetic populated Flutter captures, inspected after the exact focused checks. They contain no live customer, sales or stock data. Source screenshots supplied by the user remain in the local task evidence folder.

- [Overview composition](compact-overview-populated.png): production shared Inventory widgets with visible Sell/Create workflows and compact low-stock empty state.
- [Scoped low-stock warnings](compact-stock-warnings.png): normal, finite low and unlimited rows; warning icon, threshold and warehouse/unit semantics.
- [Mounted Products page](compact-products-mounted.png): actual Products page using injected synthetic repositories; unlimited stock and scoped loaded-product count.
- [Phone at 200% text](compact-periods-large-text-320.png): intentionally scrolled populated stock rows and whole season panel.
- [Tablet at 200% text](compact-periods-large-text-768.png): populated product and visible season actions.

The screenshots use the existing bundled NotoSans and MaterialIcons fonts. The shared shell/dock is outside these content fixtures. They establish this slice's mounted component behavior, not full navigation, native OS back, live integration or permission coverage.

## Verification

```sh
flutter gen-l10n
dart format <eight owned Dart files>
flutter test --no-pub --concurrency=1 test/features/inventory/widgets/inventory_ui_test.dart test/features/inventory/widgets/inventory_sales_periods_test.dart test/features/inventory/widgets/inventory_compact_test.dart
dart analyze --fatal-infos <eight owned Dart files>
```

All eight tests passed; scoped analysis reported no issues. Donor pubspec/lock were byte-identical and donor package-config hashes stayed unchanged. No install, local app build, live business-data write, backend grant change or shared shell edit occurred.

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
