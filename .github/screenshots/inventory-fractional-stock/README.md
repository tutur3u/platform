# Inventory fractional quantity regression evidence

Synthetic mounted Flutter widgets at **320px width and 2× text**, using the app's
NotoSans and MaterialIcons fonts. These are test captures, not native-device,
backend, or real customer/catalog evidence. Product displays `0.04 available`;
Overview preserves `0.04 / 0.123456789012345`, wrapping below the product name.
No truncation or decimal-place rounding is applied. Null stays localized
Unlimited; whole quantities omit `.0`; very small doubles may use scientific
notation. Precision is bounded by the existing parsed-double model.

The original `2.5 / 2.5` Overview regression and injected repository ownership
check moved from inventory_compact_test.dart into the focused fractional suite.
A tooltip finder now checks Add owner absence after queued success changes scope.

Focused selection (19 cases across four files):

```sh
flutter test --no-pub --concurrency=1 \
  test/features/inventory/widgets/inventory_ui_test.dart \
  test/features/inventory/widgets/inventory_compact_test.dart \
  test/features/inventory/widgets/inventory_fractional_stock_test.dart \
  test/features/inventory/view/inventory_manage_page_test.dart
```

Run from apps/mobile through the normal shared FIFO. Scoped analysis covers the
seven changed Dart files. No dependencies, localization keys, API/model/repository,
stock values, price formatting, or financial aggregates changed. Compatible
dependency metadata is reused locally without modifying its donor. CI/native
acceptance and release remain coordinator gates.
