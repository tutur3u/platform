part of 'inventory_models.dart';

class InventoryProduct extends Equatable {
  const InventoryProduct({
    required this.id,
    required this.categoryId,
    required this.ownerId,
    required this.wsId,
    required this.inventory,
    this.name,
    this.avatarUrl,
    this.manufacturerId,
    this.manufacturer,
    this.description,
    this.usage,
    this.category,
    this.owner,
    this.financeCategoryId,
    this.financeCategory,
    this.createdAt,
    this.archived = false,
  });

  factory InventoryProduct.fromJson(Map<String, dynamic> json) =>
      InventoryProduct(
        id: json['id'] as String,
        name: json['name'] as String?,
        avatarUrl: json['avatar_url'] as String?,
        manufacturerId: json['manufacturer_id'] as String?,
        manufacturer: json['manufacturer'] as String?,
        description: json['description'] as String?,
        usage: json['usage'] as String?,
        category: json['category'] as String?,
        categoryId: json['category_id'] as String? ?? '',
        ownerId: json['owner_id'] as String? ?? '',
        owner: json['owner'] is Map<String, dynamic>
            ? InventoryOwner.fromJson(json['owner'] as Map<String, dynamic>)
            : null,
        financeCategoryId: json['finance_category_id'] as String?,
        financeCategory: json['finance_category'] is Map<String, dynamic>
            ? InventoryFinanceCategory.fromJson(
                json['finance_category'] as Map<String, dynamic>,
              )
            : null,
        wsId: json['ws_id'] as String? ?? '',
        createdAt: _asDateTime(json['created_at']),
        archived: json['archived'] as bool? ?? false,
        inventory: _inventoryWithNames(json),
      );

  /// The single-product endpoint lists names in a parallel `stock` array
  /// (same order as `inventory`) instead of `unit_name`/`warehouse_name`.
  static List<InventoryStockEntry> _inventoryWithNames(
    Map<String, dynamic> json,
  ) {
    final rows = (json['inventory'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final stock = json['stock'] is List<dynamic>
        ? (json['stock'] as List<dynamic>)
        : const <dynamic>[];
    final named = stock.length == rows.length;
    return [
      for (var index = 0; index < rows.length; index++)
        InventoryStockEntry.fromJson(
          _withNames(rows[index], named ? stock[index] : null),
        ),
    ];
  }

  static Map<String, dynamic> _withNames(
    Map<String, dynamic> row,
    Object? names,
  ) {
    if (names is! Map<String, dynamic>) return row;
    return {
      ...row,
      if (row['unit_name'] == null && names['unit'] is String)
        'unit_name': names['unit'],
      if (row['warehouse_name'] == null && names['warehouse'] is String)
        'warehouse_name': names['warehouse'],
    };
  }

  final String id;
  final String? name;
  final String? avatarUrl;
  final String? manufacturerId;
  final String? manufacturer;
  final String? description;
  final String? usage;
  final String? category;
  final String categoryId;
  final String ownerId;
  final InventoryOwner? owner;
  final String? financeCategoryId;
  final InventoryFinanceCategory? financeCategory;
  final String wsId;
  final DateTime? createdAt;
  final bool archived;
  final List<InventoryStockEntry> inventory;

  @override
  List<Object?> get props => [
    id,
    name,
    avatarUrl,
    manufacturerId,
    manufacturer,
    description,
    usage,
    category,
    categoryId,
    ownerId,
    owner,
    financeCategoryId,
    financeCategory,
    wsId,
    createdAt,
    archived,
    inventory,
  ];
}
