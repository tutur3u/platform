/// Confirmed stock counts from the authorized analytics aggregate.
///
/// Quantities, currencies and sale-derived fields are not decoded.
/// Rows include archived warehouses and exclude archived products. Low/out counts
/// can overlap; they are not disjoint stock states.
class InventoryStockHealth {
  const InventoryStockHealth({
    required this.generatedAt,
    this.activeProducts,
    this.stockedProducts,
    this.lowStockRows,
    this.outOfStockRows,
    this.unlimitedStockRows,
  });

  factory InventoryStockHealth.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'];
    final values = summary is Map ? summary : const <String, dynamic>{};
    final active = _count(values['activeProducts']);
    final stocked = _count(values['stockedProducts']);
    final timestamp = json['generatedAt'];
    final hasOffset =
        timestamp is String &&
        RegExp(r'(Z|[+-]\d{2}:\d{2})$').hasMatch(timestamp);
    return InventoryStockHealth(
      generatedAt: hasOffset ? DateTime.tryParse(timestamp)?.toUtc() : null,
      activeProducts: active,
      stockedProducts: active != null && stocked != null && stocked > active
          ? null
          : stocked,
      lowStockRows: _count(values['lowStockRows']),
      outOfStockRows: _count(values['outOfStockRows']),
      unlimitedStockRows: _count(values['unlimitedStockRows']),
    );
  }

  final DateTime? generatedAt;
  final int? activeProducts;
  final int? stockedProducts;
  final int? lowStockRows;
  final int? outOfStockRows;
  final int? unlimitedStockRows;

  int? get productsWithoutStock =>
      activeProducts == null || stockedProducts == null
      ? null
      : activeProducts! - stockedProducts!;

  bool get isComplete =>
      generatedAt != null &&
      activeProducts != null &&
      stockedProducts != null &&
      lowStockRows != null &&
      outOfStockRows != null &&
      unlimitedStockRows != null;

  static int? _count(Object? value) =>
      value is num &&
          value.isFinite &&
          value >= 0 &&
          value <= 9007199254740991 &&
          value == value.roundToDouble()
      ? value.toInt()
      : null;
}
