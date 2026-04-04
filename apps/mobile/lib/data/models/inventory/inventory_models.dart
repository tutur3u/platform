import 'package:equatable/equatable.dart';

double? _asDoubleOrNull(dynamic value) => (value as num?)?.toDouble();

double _asDouble(dynamic value) => _asDoubleOrNull(value) ?? 0;

String _asString(dynamic value) => value?.toString() ?? '';

DateTime? _asDateTime(dynamic value) {
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value);
}

class InventoryLookupItem extends Equatable {
  const InventoryLookupItem({
    required this.id,
    required this.name,
  });

  factory InventoryLookupItem.fromJson(Map<String, dynamic> json) =>
      InventoryLookupItem(
        id: json['id'] as String,
        name: (json['name'] as String?)?.trim() ?? '',
      );

  final String id;
  final String name;

  @override
  List<Object?> get props => [id, name];
}

class InventoryOwner extends Equatable {
  const InventoryOwner({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.linkedWorkspaceUserId,
    this.archived = false,
    this.createdAt,
  });

  factory InventoryOwner.fromJson(Map<String, dynamic> json) => InventoryOwner(
    id: json['id'] as String,
    name: (json['name'] as String?)?.trim() ?? '',
    avatarUrl: json['avatar_url'] as String?,
    linkedWorkspaceUserId: json['linked_workspace_user_id'] as String?,
    archived: json['archived'] as bool? ?? false,
    createdAt: _asDateTime(json['created_at']),
  );

  final String id;
  final String name;
  final String? avatarUrl;
  final String? linkedWorkspaceUserId;
  final bool archived;
  final DateTime? createdAt;

  @override
  List<Object?> get props => [
    id,
    name,
    avatarUrl,
    linkedWorkspaceUserId,
    archived,
    createdAt,
  ];
}

class InventoryFinanceCategory extends Equatable {
  const InventoryFinanceCategory({
    required this.id,
    required this.name,
    this.color,
    this.icon,
  });

  factory InventoryFinanceCategory.fromJson(Map<String, dynamic> json) =>
      InventoryFinanceCategory(
        id: json['id'] as String,
        name: (json['name'] as String?)?.trim() ?? '',
        color: json['color'] as String?,
        icon: json['icon'] as String?,
      );

  final String id;
  final String name;
  final String? color;
  final String? icon;

  @override
  List<Object?> get props => [id, name, color, icon];
}

class InventoryStockEntry extends Equatable {
  const InventoryStockEntry({
    required this.unitId,
    required this.warehouseId,
    required this.amount,
    required this.minAmount,
    required this.price,
    this.unitName,
    this.warehouseName,
  });

  factory InventoryStockEntry.fromJson(Map<String, dynamic> json) =>
      InventoryStockEntry(
        unitId: json['unit_id'] as String,
        warehouseId: json['warehouse_id'] as String,
        amount: _asDoubleOrNull(json['amount']),
        minAmount: _asDouble(json['min_amount']),
        price: _asDouble(json['price']),
        unitName: json['unit_name'] as String?,
        warehouseName: json['warehouse_name'] as String?,
      );

  final String unitId;
  final String warehouseId;
  final double? amount;
  final double minAmount;
  final double price;
  final String? unitName;
  final String? warehouseName;

  @override
  List<Object?> get props => [
    unitId,
    warehouseId,
    amount,
    minAmount,
    price,
    unitName,
    warehouseName,
  ];
}

class InventoryProduct extends Equatable {
  const InventoryProduct({
    required this.id,
    required this.categoryId,
    required this.ownerId,
    required this.wsId,
    required this.inventory,
    this.name,
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

class InventoryOverviewTotals extends Equatable {
  const InventoryOverviewTotals({
    required this.walletsCount,
    required this.totalIncome,
    required this.totalExpense,
    required this.inventorySalesRevenue,
    required this.inventorySalesCount,
  });

  factory InventoryOverviewTotals.fromJson(Map<String, dynamic> json) =>
      InventoryOverviewTotals(
        walletsCount: (json['wallets_count'] as num?)?.toInt() ?? 0,
        totalIncome: _asDouble(json['total_income']),
        totalExpense: _asDouble(json['total_expense']),
        inventorySalesRevenue: _asDouble(json['inventory_sales_revenue']),
        inventorySalesCount:
            (json['inventory_sales_count'] as num?)?.toInt() ?? 0,
      );

  final int walletsCount;
  final double totalIncome;
  final double totalExpense;
  final double inventorySalesRevenue;
  final int inventorySalesCount;

  @override
  List<Object?> get props => [
    walletsCount,
    totalIncome,
    totalExpense,
    inventorySalesRevenue,
    inventorySalesCount,
  ];
}

class InventoryLowStockProduct extends Equatable {
  const InventoryLowStockProduct({
    required this.amount,
    required this.minAmount,
    required this.price,
    this.productId,
    this.productName,
    this.ownerName,
    this.categoryName,
    this.unitName,
    this.warehouseName,
  });

  factory InventoryLowStockProduct.fromJson(Map<String, dynamic> json) =>
      InventoryLowStockProduct(
        productId: json['product_id'] as String?,
        productName: json['product_name'] as String?,
        ownerName: json['owner_name'] as String?,
        categoryName: json['category_name'] as String?,
        amount: _asDoubleOrNull(json['amount']),
        minAmount: _asDoubleOrNull(json['min_amount']),
        price: _asDouble(json['price']),
        unitName: json['unit_name'] as String?,
        warehouseName: json['warehouse_name'] as String?,
      );

  final String? productId;
  final String? productName;
  final String? ownerName;
  final String? categoryName;
  final double? amount;
  final double? minAmount;
  final double price;
  final String? unitName;
  final String? warehouseName;

  @override
  List<Object?> get props => [
    productId,
    productName,
    ownerName,
    categoryName,
    amount,
    minAmount,
    price,
    unitName,
    warehouseName,
  ];
}

class InventoryRecentSale extends Equatable {
  const InventoryRecentSale({
    required this.id,
    required this.paidAmount,
    required this.itemsCount,
    required this.owners,
    this.createdAt,
    this.completedAt,
    this.walletName,
    this.categoryName,
    this.customerName,
    this.creatorName,
  });

  factory InventoryRecentSale.fromJson(Map<String, dynamic> json) =>
      InventoryRecentSale(
        id: json['id'] as String,
        paidAmount: _asDouble(json['paid_amount']),
        itemsCount: (json['items_count'] as num?)?.toInt() ?? 0,
        owners: (json['owners'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<String>()
            .toList(growable: false),
        createdAt: _asDateTime(json['created_at']),
        completedAt: _asDateTime(json['completed_at']),
        walletName: json['wallet_name'] as String?,
        categoryName: json['category_name'] as String?,
        customerName: json['customer_name'] as String?,
        creatorName: json['creator_name'] as String?,
      );

  final String id;
  final double paidAmount;
  final int itemsCount;
  final List<String> owners;
  final DateTime? createdAt;
  final DateTime? completedAt;
  final String? walletName;
  final String? categoryName;
  final String? customerName;
  final String? creatorName;

  @override
  List<Object?> get props => [
    id,
    paidAmount,
    itemsCount,
    owners,
    createdAt,
    completedAt,
    walletName,
    categoryName,
    customerName,
    creatorName,
  ];
}

class InventoryBreakdownEntry extends Equatable {
  const InventoryBreakdownEntry({
    required this.label,
    required this.revenue,
    required this.quantity,
    this.id,
  });

  factory InventoryBreakdownEntry.fromJson(
    Map<String, dynamic> json, {
    required String labelKey,
    String? idKey,
  }) => InventoryBreakdownEntry(
    id: idKey == null ? null : json[idKey] as String?,
    label: (json[labelKey] as String?)?.trim().isNotEmpty ?? false
        ? (json[labelKey] as String)
        : 'Unknown',
    revenue: _asDouble(json['revenue']),
    quantity: _asDouble(json['quantity']),
  );

  final String? id;
  final String label;
  final double revenue;
  final double quantity;

  @override
  List<Object?> get props => [id, label, revenue, quantity];
}

class InventoryOverview extends Equatable {
  const InventoryOverview({
    required this.realtimeEnabled,
    required this.totals,
    required this.lowStockProducts,
    required this.recentSales,
    required this.ownerBreakdown,
    required this.categoryBreakdown,
  });

  factory InventoryOverview.fromJson(Map<String, dynamic> json) =>
      InventoryOverview(
        realtimeEnabled: json['realtime_enabled'] as bool? ?? false,
        totals: InventoryOverviewTotals.fromJson(
          json['totals'] as Map<String, dynamic>? ?? const <String, dynamic>{},
        ),
        lowStockProducts:
            (json['low_stock_products'] as List<dynamic>? ?? const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map(InventoryLowStockProduct.fromJson)
                .toList(growable: false),
        recentSales:
            (json['recent_sales'] as List<dynamic>? ?? const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map(InventoryRecentSale.fromJson)
                .toList(growable: false),
        ownerBreakdown:
            (json['owner_breakdown'] as List<dynamic>? ?? const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map(
                  (item) => InventoryBreakdownEntry.fromJson(
                    item,
                    labelKey: 'owner_name',
                    idKey: 'owner_id',
                  ),
                )
                .toList(growable: false),
        categoryBreakdown:
            (json['category_breakdown'] as List<dynamic>? ?? const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map(
                  (item) => InventoryBreakdownEntry.fromJson(
                    item,
                    labelKey: 'category_name',
                  ),
                )
                .toList(growable: false),
      );

  final bool realtimeEnabled;
  final InventoryOverviewTotals totals;
  final List<InventoryLowStockProduct> lowStockProducts;
  final List<InventoryRecentSale> recentSales;
  final List<InventoryBreakdownEntry> ownerBreakdown;
  final List<InventoryBreakdownEntry> categoryBreakdown;

  @override
  List<Object?> get props => [
    realtimeEnabled,
    totals,
    lowStockProducts,
    recentSales,
    ownerBreakdown,
    categoryBreakdown,
  ];
}

class InventorySaleSummary extends Equatable {
  const InventorySaleSummary({
    required this.id,
    required this.paidAmount,
    required this.itemsCount,
    required this.totalQuantity,
    required this.owners,
    this.notice,
    this.note,
    this.createdAt,
    this.completedAt,
    this.walletName,
    this.categoryName,
    this.customerName,
    this.creatorName,
  });

  factory InventorySaleSummary.fromJson(Map<String, dynamic> json) =>
      InventorySaleSummary(
        id: json['id'] as String,
        notice: json['notice'] as String?,
        note: json['note'] as String?,
        paidAmount: _asDouble(json['paid_amount']),
        itemsCount: (json['items_count'] as num?)?.toInt() ?? 0,
        totalQuantity: _asDouble(json['total_quantity']),
        owners: (json['owners'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<String>()
            .toList(growable: false),
        createdAt: _asDateTime(json['created_at']),
        completedAt: _asDateTime(json['completed_at']),
        walletName: json['wallet_name'] as String?,
        categoryName: json['category_name'] as String?,
        customerName: json['customer_name'] as String?,
        creatorName: json['creator_name'] as String?,
      );

  final String id;
  final String? notice;
  final String? note;
  final double paidAmount;
  final int itemsCount;
  final double totalQuantity;
  final List<String> owners;
  final DateTime? createdAt;
  final DateTime? completedAt;
  final String? walletName;
  final String? categoryName;
  final String? customerName;
  final String? creatorName;

  @override
  List<Object?> get props => [
    id,
    notice,
    note,
    paidAmount,
    itemsCount,
    totalQuantity,
    owners,
    createdAt,
    completedAt,
    walletName,
    categoryName,
    customerName,
    creatorName,
  ];
}

class InventoryAuditLogEntry extends Equatable {
  const InventoryAuditLogEntry({
    required this.auditRecordId,
    required this.eventKind,
    required this.entityKind,
    required this.entityId,
    required this.summary,
    required this.changedFields,
    required this.occurredAt,
    this.source,
  });

  factory InventoryAuditLogEntry.fromJson(Map<String, dynamic> json) =>
      InventoryAuditLogEntry(
        auditRecordId: _asString(json['auditRecordId']),
        eventKind: json['eventKind'] as String? ?? '',
        entityKind: json['entityKind'] as String? ?? '',
        entityId: _asString(json['entityId']),
        summary: json['summary'] as String? ?? '',
        changedFields:
            (json['changedFields'] as List<dynamic>? ?? const <dynamic>[])
                .whereType<String>()
                .toList(growable: false),
        occurredAt: _asDateTime(json['occurredAt']) ?? DateTime.now(),
        source: json['source'] as String?,
      );

  final String auditRecordId;
  final String eventKind;
  final String entityKind;
  final String entityId;
  final String summary;
  final List<String> changedFields;
  final DateTime occurredAt;
  final String? source;

  @override
  List<Object?> get props => [
    auditRecordId,
    eventKind,
    entityKind,
    entityId,
    summary,
    changedFields,
    occurredAt,
    source,
  ];
}
