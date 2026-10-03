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
        inventory: (json['inventory'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(InventoryStockEntry.fromJson)
            .toList(growable: false),
      );

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
