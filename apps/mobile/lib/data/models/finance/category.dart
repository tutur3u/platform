import 'package:equatable/equatable.dart';

class TransactionCategory extends Equatable {
  const TransactionCategory({
    required this.id,
    this.name,
    this.isExpense,
    this.wsId,
  });

  factory TransactionCategory.fromJson(Map<String, dynamic> json) =>
      TransactionCategory(
        id: json['id'] as String,
        name: json['name'] as String?,
        isExpense: json['is_expense'] as bool?,
        wsId: json['ws_id'] as String?,
      );

  final String id;
  final String? name;
  final bool? isExpense;
  final String? wsId;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'is_expense': isExpense,
    'ws_id': wsId,
  };

  @override
  List<Object?> get props => [id, name, isExpense, wsId];
}
