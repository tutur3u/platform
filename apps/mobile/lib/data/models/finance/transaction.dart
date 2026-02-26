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
    this.categoryName,
    this.walletName,
    this.walletCurrency,
    this.reportOptIn,
    this.isAmountConfidential,
    this.isDescriptionConfidential,
    this.isCategoryConfidential,
  });

  factory Transaction.fromJson(Map<String, dynamic> json) {
    // Handle nested category/wallet from PostgREST join.
    final category = json['category'] as Map<String, dynamic>?;
    final wallet = json['wallet'] as Map<String, dynamic>?;

    return Transaction(
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
      categoryName:
          category?['name'] as String? ?? json['category_name'] as String?,
      walletName: wallet?['name'] as String? ?? json['wallet_name'] as String?,
      walletCurrency:
          wallet?['currency'] as String? ?? json['wallet_currency'] as String?,
      reportOptIn: json['report_opt_in'] as bool?,
      isAmountConfidential: json['is_amount_confidential'] as bool?,
      isDescriptionConfidential: json['is_description_confidential'] as bool?,
      isCategoryConfidential: json['is_category_confidential'] as bool?,
    );
  }

  final String id;
  final double? amount;
  final String? description;
  final String? categoryId;
  final String? walletId;
  final DateTime? takenAt;
  final DateTime? createdAt;

  /// Joined from `transaction_categories.name`.
  final String? categoryName;

  /// Joined from `workspace_wallets.name`.
  final String? walletName;

  /// Joined from `workspace_wallets.currency`.
  final String? walletCurrency;

  final bool? reportOptIn;
  final bool? isAmountConfidential;
  final bool? isDescriptionConfidential;
  final bool? isCategoryConfidential;

  Map<String, dynamic> toJson() => {
    'id': id,
    'amount': amount,
    'description': description,
    'category_id': categoryId,
    'wallet_id': walletId,
    'taken_at': takenAt?.toIso8601String(),
    'created_at': createdAt?.toIso8601String(),
    'report_opt_in': reportOptIn,
    'is_amount_confidential': isAmountConfidential,
    'is_description_confidential': isDescriptionConfidential,
    'is_category_confidential': isCategoryConfidential,
  };

  @override
  List<Object?> get props => [
    id,
    amount,
    description,
    categoryId,
    walletId,
    takenAt,
    createdAt,
    categoryName,
    walletName,
    walletCurrency,
    reportOptIn,
    isAmountConfidential,
    isDescriptionConfidential,
    isCategoryConfidential,
  ];
}
