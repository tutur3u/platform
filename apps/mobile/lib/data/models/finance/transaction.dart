import 'package:equatable/equatable.dart';

class Transaction extends Equatable {
  const Transaction({
    required this.id,
    this.amount,
    this.description,
    this.categoryId,
    this.walletId,
    this.takenAt,
    this.createdAt,
  });

  factory Transaction.fromJson(Map<String, dynamic> json) => Transaction(
        id: json['id'] as String,
        amount: (json['amount'] as num?)?.toDouble(),
        description: json['description'] as String?,
        categoryId: json['category_id'] as String?,
        walletId: json['wallet_id'] as String?,
        takenAt: json['taken_at'] != null
            ? DateTime.parse(json['taken_at'] as String)
            : null,
        createdAt: json['created_at'] != null
            ? DateTime.parse(json['created_at'] as String)
            : null,
      );

  final String id;
  final double? amount;
  final String? description;
  final String? categoryId;
  final String? walletId;
  final DateTime? takenAt;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'amount': amount,
        'description': description,
        'category_id': categoryId,
        'wallet_id': walletId,
        'taken_at': takenAt?.toIso8601String(),
        'created_at': createdAt?.toIso8601String(),
      };

  @override
  List<Object?> get props =>
      [id, amount, description, categoryId, walletId, takenAt, createdAt];
}
