import 'package:equatable/equatable.dart';

/// A discount code applied to invoices: a percentage when [useRatio], else a
/// fixed amount in the workspace currency.
class FinancePromotion extends Equatable {
  const FinancePromotion({
    required this.id,
    required this.name,
    required this.code,
    required this.value,
    this.useRatio = true,
    this.description,
    this.maxUses,
    this.currentUses = 0,
  });

  factory FinancePromotion.fromJson(Map<String, dynamic> json) =>
      FinancePromotion(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        code: json['code'] as String? ?? '',
        value: switch (json['value']) {
          final num value => value.toDouble(),
          final String value => double.tryParse(value) ?? 0,
          _ => 0,
        },
        useRatio: json['use_ratio'] as bool? ?? true,
        description: json['description'] as String?,
        maxUses: (json['max_uses'] as num?)?.toInt(),
        currentUses: (json['current_uses'] as num?)?.toInt() ?? 0,
      );

  final String id;
  final String name;
  final String code;
  final double value;
  final bool useRatio;
  final String? description;

  /// Null means unlimited.
  final int? maxUses;
  final int currentUses;

  bool get usedUp => maxUses != null && currentUses >= maxUses!;

  /// Body for create and update.
  Map<String, dynamic> toPayload() => {
    'name': name,
    'code': code,
    'description': description,
    'value': value,
    'unit': useRatio ? 'percentage' : 'currency',
    'max_uses': maxUses,
  };

  @override
  List<Object?> get props => [
    id,
    name,
    code,
    value,
    useRatio,
    description,
    maxUses,
    currentUses,
  ];
}
