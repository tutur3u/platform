import 'package:equatable/equatable.dart';

class Storefront extends Equatable {
  const Storefront({
    required this.id,
    required this.name,
    required this.slug,
    required this.status,
    required this.visibility,
    required this.currency,
    required this.checkoutMode,
    required this.themePreset,
    required this.layoutStyle,
    required this.surfaceStyle,
    required this.cornerStyle,
    required this.showInventoryBadges,
    required this.analyticsEnabled,
    required this.listingsCount,
    this.description,
    this.accentColor,
  });

  factory Storefront.fromJson(Map<String, dynamic> json) => Storefront(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    slug: json['slug'] as String? ?? '',
    description: json['description'] as String?,
    status: json['status'] as String? ?? 'draft',
    visibility: json['visibility'] as String? ?? 'private',
    currency: json['currency'] as String? ?? 'USD',
    checkoutMode: json['checkoutMode'] as String? ?? 'disabled',
    themePreset: json['themePreset'] as String? ?? 'minimal',
    layoutStyle: json['layoutStyle'] as String? ?? 'grid',
    surfaceStyle: json['surfaceStyle'] as String? ?? 'solid',
    cornerStyle: json['cornerStyle'] as String? ?? 'rounded',
    accentColor: json['accentColor'] as String?,
    showInventoryBadges: json['showInventoryBadges'] as bool? ?? true,
    analyticsEnabled: json['analyticsEnabled'] as bool? ?? true,
    listingsCount: (json['listingsCount'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String name;
  final String slug;
  final String? description;
  final String status;
  final String visibility;
  final String currency;
  final String checkoutMode;
  final String themePreset;
  final String layoutStyle;
  final String surfaceStyle;
  final String cornerStyle;
  final String? accentColor;
  final bool showInventoryBadges;
  final bool analyticsEnabled;
  final int listingsCount;

  bool get isPublished => status == 'published';
  bool get isPublic => visibility == 'public';

  @override
  List<Object?> get props => [
    id,
    name,
    slug,
    description,
    status,
    visibility,
    currency,
    checkoutMode,
    themePreset,
    layoutStyle,
    surfaceStyle,
    cornerStyle,
    accentColor,
    showInventoryBadges,
    analyticsEnabled,
    listingsCount,
  ];
}

class StorefrontListing extends Equatable {
  const StorefrontListing({
    required this.id,
    required this.storefrontId,
    required this.title,
    required this.price,
    required this.status,
    required this.maxPerOrder,
    required this.sortOrder,
    this.description,
    this.productId,
    this.unitId,
    this.warehouseId,
    this.compareAtPrice,
    this.availableQuantity,
    this.unitName,
    this.warehouseName,
  });

  factory StorefrontListing.fromJson(Map<String, dynamic> json) =>
      StorefrontListing(
        id: json['id'] as String? ?? '',
        storefrontId: json['storefrontId'] as String? ?? '',
        title: json['title'] as String? ?? '',
        description: json['description'] as String?,
        productId: json['productId'] as String?,
        unitId: json['unitId'] as String?,
        warehouseId: json['warehouseId'] as String?,
        price: (json['price'] as num?)?.toDouble() ?? 0,
        compareAtPrice: (json['compareAtPrice'] as num?)?.toDouble(),
        status: json['status'] as String? ?? 'draft',
        maxPerOrder: (json['maxPerOrder'] as num?)?.toInt() ?? 1,
        sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
        availableQuantity: (json['availableQuantity'] as num?)?.toDouble(),
        unitName: json['unitName'] as String?,
        warehouseName: json['warehouseName'] as String?,
      );

  final String id;
  final String storefrontId;
  final String title;
  final String? description;
  final String? productId;
  final String? unitId;
  final String? warehouseId;
  final double price;
  final double? compareAtPrice;
  final String status;
  final int maxPerOrder;
  final int sortOrder;
  final double? availableQuantity;
  final String? unitName;
  final String? warehouseName;

  @override
  List<Object?> get props => [
    id,
    storefrontId,
    title,
    description,
    productId,
    unitId,
    warehouseId,
    price,
    compareAtPrice,
    status,
    maxPerOrder,
    sortOrder,
    availableQuantity,
    unitName,
    warehouseName,
  ];
}
