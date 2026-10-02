import 'package:equatable/equatable.dart';

String _asString(dynamic value) => value?.toString() ?? '';
DateTime? _asDateTime(dynamic value) =>
    value is String ? DateTime.tryParse(value) : null;

class InventorySalesPeriod extends Equatable {
  const InventorySalesPeriod({
    required this.id,
    required this.name,
    required this.status,
    required this.saleCount,
    this.description,
    this.startsAt,
    this.endsAt,
    this.pricingMode = 'legacy',
    this.timeZone,
    this.productScope = 'all',
    this.productIds = const [],
  });

  factory InventorySalesPeriod.fromJson(Map<String, dynamic> json) =>
      InventorySalesPeriod(
        id: _asString(json['id']),
        name: _asString(json['name']),
        description: json['description'] as String?,
        startsAt: _asDateTime(json['starts_at']),
        endsAt: _asDateTime(json['ends_at']),
        status: _asString(json['status']).isEmpty
            ? 'active'
            : _asString(json['status']),
        saleCount: (json['sale_count'] as num?)?.toInt() ?? 0,
        pricingMode: json['pricing_mode'] as String? ?? 'legacy',
        timeZone: json['time_zone'] as String?,
        productScope: _asString(json['product_scope']).isEmpty
            ? 'all'
            : _asString(json['product_scope']),
        productIds: (json['product_ids'] as List<dynamic>? ?? const <dynamic>[])
            .map(_asString)
            .where((value) => value.isNotEmpty)
            .toList(growable: false),
      );

  final String id;
  final String name;
  final String? description;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final String status;
  final int saleCount;
  final String pricingMode;
  final String? timeZone;
  bool get isScheduled => pricingMode == 'scheduled';

  final String productScope;
  final List<String> productIds;

  bool get isArchived => status == 'archived';

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    startsAt,
    endsAt,
    status,
    saleCount,
    pricingMode,
    timeZone,
    productScope,
    productIds,
  ];
}
