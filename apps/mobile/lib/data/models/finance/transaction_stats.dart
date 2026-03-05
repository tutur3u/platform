import 'package:equatable/equatable.dart';

class TransactionStats extends Equatable {
  const TransactionStats({
    required this.totalTransactions,
    required this.totalIncome,
    required this.totalExpense,
    required this.netTotal,
    this.hasRedactedAmounts = false,
    this.currency,
  });

  factory TransactionStats.fromJson(Map<String, dynamic> json) {
    return TransactionStats(
      totalTransactions: (json['totalTransactions'] as num?)?.toInt() ?? 0,
      totalIncome: (json['totalIncome'] as num?)?.toDouble() ?? 0,
      totalExpense: (json['totalExpense'] as num?)?.toDouble() ?? 0,
      netTotal: (json['netTotal'] as num?)?.toDouble() ?? 0,
      hasRedactedAmounts: json['hasRedactedAmounts'] as bool? ?? false,
      currency:
          json['currency'] as String? ??
          json['walletCurrency'] as String? ??
          json['wallet_currency'] as String?,
    );
  }

  final int totalTransactions;
  final double totalIncome;
  final double totalExpense;
  final double netTotal;
  final bool hasRedactedAmounts;
  final String? currency;

  TransactionStats copyWith({
    int? totalTransactions,
    double? totalIncome,
    double? totalExpense,
    double? netTotal,
    bool? hasRedactedAmounts,
    String? currency,
  }) {
    return TransactionStats(
      totalTransactions: totalTransactions ?? this.totalTransactions,
      totalIncome: totalIncome ?? this.totalIncome,
      totalExpense: totalExpense ?? this.totalExpense,
      netTotal: netTotal ?? this.netTotal,
      hasRedactedAmounts: hasRedactedAmounts ?? this.hasRedactedAmounts,
      currency: currency ?? this.currency,
    );
  }

  @override
  List<Object?> get props => [
    totalTransactions,
    totalIncome,
    totalExpense,
    netTotal,
    hasRedactedAmounts,
    currency,
  ];
}
