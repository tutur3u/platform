import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/inventory/inventory_checkout_defaults.dart';
import 'package:mobile/data/models/inventory/inventory_sales_period.dart';

InventorySalesPeriod _period(
  String id, {
  bool scheduled = true,
  String status = 'active',
}) => InventorySalesPeriod(
  id: id,
  name: id,
  status: status,
  saleCount: 0,
  startsAt: DateTime(2026, 9, 30),
  endsAt: DateTime(2026, 9, 30),
  pricingMode: scheduled ? 'scheduled' : 'legacy',
  timeZone: 'America/Los_Angeles',
);

void main() {
  final now = DateTime.utc(2026, 10, 1, 1);
  test('workspace defaults decode current API metadata', () {
    final defaults = InventoryCheckoutDefaults.fromJson({
      'defaultSalesPeriodId': 'season',
      'defaultRevenueWalletId': 'revenue',
      'defaultWalletId': 'wallet',
      'defaultFinanceCategoryId': 'category',
    });
    expect(defaults.salesPeriodId, 'season');
    expect(defaults.revenueWalletId, 'revenue');
    expect(defaults.walletId, 'wallet');
    expect(defaults.financeCategoryId, 'category');
  });
  test(
    'configured current period wins, including legacy, using its local day',
    () {
      const defaults = InventoryCheckoutDefaults(salesPeriodId: 'configured');
      expect(
        defaults.resolvePeriod([
          _period('scheduled'),
          _period('configured', scheduled: false),
        ], now),
        'configured',
      );
      expect(
        defaults.resolvePeriod([
          _period('configured'),
        ], DateTime.utc(2026, 10, 2)),
        isNull,
      );
    },
  );
  test(
    'one current scheduled period is inferred; ambiguity/archived cannot auto-select',
    () {
      const defaults = InventoryCheckoutDefaults(salesPeriodId: 'missing');
      expect(defaults.resolvePeriod([_period('only')], now), 'only');
      expect(defaults.resolvePeriod([_period('a'), _period('b')], now), isNull);
      expect(
        defaults.resolvePeriod([_period('a', status: 'archived')], now),
        isNull,
      );
    },
  );
  test('all period modes honor allowlist and blocklist rules', () {
    const period = InventorySalesPeriod(
      id: 'legacy',
      name: 'Legacy',
      status: 'active',
      saleCount: 0,
      productScope: 'allowlist',
      productIds: ['allowed'],
    );
    expect(inventoryPeriodAllowsProduct(period, 'allowed'), isTrue);
    expect(inventoryPeriodAllowsProduct(period, 'other'), isFalse);
    final blocked = InventorySalesPeriod.fromJson(const {
      'id': 'blocked',
      'product_scope': 'blocklist',
      'product_ids': ['blocked'],
    });
    expect(inventoryPeriodAllowsProduct(blocked, 'blocked'), isFalse);
    expect(inventoryPeriodAllowsProduct(blocked, 'other'), isTrue);
  });
}
