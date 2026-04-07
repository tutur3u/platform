import 'package:equatable/equatable.dart';

class FinanceTag extends Equatable {
  const FinanceTag({
    required this.id,
    required this.name,
    this.color,
    this.description,
    this.wsId,
    this.amount,
    this.transactionCount,
  });

  factory FinanceTag.fromJson(Map<String, dynamic> json) => FinanceTag(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    color: json['color'] as String?,
    description: json['description'] as String?,
    wsId: json['ws_id'] as String?,
    amount: (json['amount'] as num?)?.toDouble(),
    transactionCount: json['transaction_count'] as int?,
  );

  final String id;
  final String name;
  final String? color;
  final String? description;
  final String? wsId;
  final double? amount;
  final int? transactionCount;

  @override
  List<Object?> get props => [
    id,
    name,
    color,
    description,
    wsId,
    amount,
    transactionCount,
  ];
}
