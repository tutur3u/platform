import 'package:equatable/equatable.dart';

class TransactionCategory extends Equatable {
  const TransactionCategory({
    required this.id,
    this.name,
    this.isExpense,
    this.wsId,
    this.icon,
    this.color,
    this.amount,
    this.transactionCount,
  });

  factory TransactionCategory.fromJson(Map<String, dynamic> json) =>
      TransactionCategory(
        id: json['id'] as String,
        name: json['name'] as String?,
        isExpense: json['is_expense'] as bool?,
        wsId: json['ws_id'] as String?,
        icon: json['icon'] as String?,
        color: json['color'] as String?,
        amount: (json['amount'] as num?)?.toDouble(),
        transactionCount: json['transaction_count'] as int?,
      );

  final String id;
  final String? name;
  final bool? isExpense;
  final String? wsId;
  final String? icon;
  final String? color;
  final double? amount;
  final int? transactionCount;

  Map<String, dynamic> toJson() => {
    'id': id,
    if (name != null) 'name': name,
    if (isExpense != null) 'is_expense': isExpense,
    if (wsId != null) 'ws_id': wsId,
    if (icon != null) 'icon': icon,
    if (color != null) 'color': color,
    if (amount != null) 'amount': amount,
    if (transactionCount != null) 'transaction_count': transactionCount,
  };

  @override
  List<Object?> get props => [
    id,
    name,
    isExpense,
    wsId,
    icon,
    color,
    amount,
    transactionCount,
  ];
}
