import 'package:mobile/data/models/inventory/inventory_sales_period.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

bool _timeZonesReady = false;

/// Workspace defaults use the same current-period selection as Inventory web.
class InventoryCheckoutDefaults {
  const InventoryCheckoutDefaults({
    this.salesPeriodId,
    this.revenueWalletId,
    this.financeCategoryId,
    this.walletId,
  });

  factory InventoryCheckoutDefaults.fromJson(Map<String, dynamic> json) =>
      InventoryCheckoutDefaults(
        salesPeriodId: json['defaultSalesPeriodId'] as String?,
        revenueWalletId: json['defaultRevenueWalletId'] as String?,
        financeCategoryId: json['defaultFinanceCategoryId'] as String?,
        walletId: json['defaultWalletId'] as String?,
      );

  final String? salesPeriodId;
  final String? revenueWalletId;
  final String? financeCategoryId;
  final String? walletId;

  String? resolvePeriod(List<InventorySalesPeriod> periods, DateTime now) {
    final current = periods.where(
      (period) => inventoryPeriodIsCurrent(period, now),
    );
    for (final period in current) {
      if (period.id == salesPeriodId) return period.id;
    }
    final scheduled = current.where((period) => period.isScheduled).toList();
    return scheduled.length == 1 ? scheduled.single.id : null;
  }
}

bool inventoryPeriodAllowsProduct(InventorySalesPeriod period, String id) =>
    switch (period.productScope) {
      'all' => true,
      'allowlist' => period.productIds.contains(id),
      'blocklist' => !period.productIds.contains(id),
      _ => false,
    };

bool inventoryPeriodIsCurrent(InventorySalesPeriod period, DateTime now) {
  if (period.status != 'active' ||
      period.startsAt == null ||
      period.endsAt == null) {
    return false;
  }
  try {
    if (!_timeZonesReady) {
      tzdata.initializeTimeZones();
      _timeZonesReady = true;
    }
    final zone = period.timeZone;
    final local = zone == null || zone.isEmpty
        ? now.toLocal()
        : tz.TZDateTime.from(now, tz.getLocation(zone));
    final day = DateTime.utc(local.year, local.month, local.day);
    final start = period.startsAt!;
    final end = period.endsAt!;
    return !day.isBefore(DateTime.utc(start.year, start.month, start.day)) &&
        !day.isAfter(DateTime.utc(end.year, end.month, end.day));
  } on Object {
    return false;
  }
}
