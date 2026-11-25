import 'package:mobile/data/models/inventory/inventory_models.dart';

/// Overall stock state of one item across its locations.
enum InventoryStockState { hidden, none, unlimited, inStock, low, out }

/// Stock filter the items list applies to loaded rows; the products API has
/// no stock or warehouse filter.
enum InventoryStockFilter { any, inStock, low, out }

bool inventoryStockIsLow(InventoryStockEntry row) =>
    row.amount != null && row.amount! <= row.minAmount;

bool inventoryProductHasLowStock(InventoryProduct product) =>
    product.inventory.any(inventoryStockIsLow);

/// Per-item stock roll-up for list rows and the detail header.
///
/// Quantities are only added up when every tracked location uses the same
/// unit, because unlike units cannot be summed.
class InventoryStockSummary {
  const InventoryStockSummary._({
    required this.state,
    required this.locations,
    required this.lowCount,
    required this.outCount,
    this.total,
    this.unit,
    this.minPrice,
    this.maxPrice,
  });

  /// [stockVisible] false means the API omitted stock for this actor; null
  /// while permissions load, when an empty list stays unlabelled as none.
  factory InventoryStockSummary.of(
    InventoryProduct product, {
    bool? stockVisible,
  }) {
    final rows = product.inventory;
    if (stockVisible == false) {
      return const InventoryStockSummary._(
        state: InventoryStockState.hidden,
        locations: 0,
        lowCount: 0,
        outCount: 0,
      );
    }
    final prices = [for (final row in rows) row.price];
    final tracked = [
      for (final row in rows)
        if (row.amount != null) row,
    ];
    final out = tracked.where((row) => row.amount! <= 0).length;
    final low = tracked
        .where((row) => row.amount! > 0 && inventoryStockIsLow(row))
        .length;
    final units = {for (final row in tracked) row.unitId};
    final state = rows.isEmpty
        ? InventoryStockState.none
        : tracked.isEmpty
        ? InventoryStockState.unlimited
        // Unlimited locations can still sell, so the item is not out.
        : out == tracked.length && tracked.length == rows.length
        ? InventoryStockState.out
        : out > 0 || low > 0
        ? InventoryStockState.low
        : InventoryStockState.inStock;
    return InventoryStockSummary._(
      state: state,
      locations: rows.length,
      lowCount: low,
      outCount: out,
      total: units.length == 1
          ? tracked.fold<double>(0, (sum, row) => sum + row.amount!)
          : null,
      unit: units.length == 1 ? tracked.first.unitName?.trim() : null,
      minPrice: prices.isEmpty ? null : prices.reduce((a, b) => a < b ? a : b),
      maxPrice: prices.isEmpty ? null : prices.reduce((a, b) => a > b ? a : b),
    );
  }

  final InventoryStockState state;
  final int locations;
  final int lowCount;
  final int outCount;

  /// Sum across locations, only when they share one unit.
  final double? total;
  final String? unit;
  final double? minPrice;
  final double? maxPrice;

  bool get hasPriceRange =>
      minPrice != null && maxPrice != null && maxPrice! > minPrice!;

  bool matches(InventoryStockFilter filter) => switch (filter) {
    InventoryStockFilter.any => true,
    InventoryStockFilter.inStock =>
      state == InventoryStockState.inStock ||
          state == InventoryStockState.unlimited,
    InventoryStockFilter.low => state == InventoryStockState.low,
    InventoryStockFilter.out => state == InventoryStockState.out,
  };
}

/// Whether [product] keeps stock in [warehouseId] (any when null).
bool inventoryProductInWarehouse(
  InventoryProduct product,
  String? warehouseId,
) =>
    warehouseId == null ||
    product.inventory.any((row) => row.warehouseId == warehouseId);
