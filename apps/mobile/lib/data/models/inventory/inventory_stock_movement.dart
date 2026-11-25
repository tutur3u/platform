import 'package:equatable/equatable.dart';

/// Server-side sort orders the catalog products endpoint accepts.
enum InventoryProductSort {
  newest(null, null),
  oldest('created_at', 'asc'),
  nameAsc('name', 'asc'),
  nameDesc('name', 'desc');

  const InventoryProductSort(this.sortBy, this.sortOrder);

  /// Null keeps the server default (newest first) and its cache key.
  final String? sortBy;
  final String? sortOrder;
}

/// One stock change from `products/{id}/inventory/history`.
class InventoryStockMovement extends Equatable {
  const InventoryStockMovement({
    required this.id,
    required this.delta,
    required this.unitId,
    required this.warehouseId,
    this.timestamp,
    this.note,
    this.unitName,
    this.warehouseName,
    this.operatorName,
    this.beneficiaryName,
  });

  factory InventoryStockMovement.fromJson(Map<String, dynamic> json) {
    String? name(Object? value) {
      if (value is! Map<String, dynamic>) return null;
      final text = (value['name'] ?? value['email']) as String?;
      return text == null || text.trim().isEmpty ? null : text.trim();
    }

    return InventoryStockMovement(
      id: json['id'] as String? ?? '',
      delta: (json['delta'] as num?)?.toDouble() ?? 0,
      unitId: json['unitId'] as String? ?? '',
      warehouseId: json['warehouseId'] as String? ?? '',
      timestamp: DateTime.tryParse(json['timestamp'] as String? ?? ''),
      note: (json['note'] as String?)?.trim(),
      unitName: name(json['unit']),
      warehouseName: name(json['warehouse']),
      operatorName: name(json['operator']),
      beneficiaryName: name(json['beneficiary']),
    );
  }

  final String id;

  /// Positive when stock was added, negative when removed.
  final double delta;
  final String unitId;
  final String warehouseId;
  final DateTime? timestamp;
  final String? note;
  final String? unitName;
  final String? warehouseName;
  final String? operatorName;
  final String? beneficiaryName;

  bool get added => delta >= 0;

  @override
  List<Object?> get props => [
    id,
    delta,
    unitId,
    warehouseId,
    timestamp,
    note,
    unitName,
    warehouseName,
    operatorName,
    beneficiaryName,
  ];
}

/// A page of stock movements, newest first.
class InventoryStockHistoryPage extends Equatable {
  const InventoryStockHistoryPage({
    required this.movements,
    required this.hasMore,
    required this.offset,
  });

  factory InventoryStockHistoryPage.fromJson(Map<String, dynamic> json) {
    final pagination = json['pagination'];
    return InventoryStockHistoryPage(
      movements: (json['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(InventoryStockMovement.fromJson)
          .toList(growable: false),
      hasMore:
          pagination is Map<String, dynamic> &&
          (pagination['hasMore'] as bool? ?? false),
      offset: pagination is Map<String, dynamic>
          ? (pagination['offset'] as num?)?.toInt() ?? 0
          : 0,
    );
  }

  final List<InventoryStockMovement> movements;
  final bool hasMore;
  final int offset;

  @override
  List<Object?> get props => [movements, hasMore, offset];
}
