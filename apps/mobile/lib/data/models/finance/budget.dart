import 'package:equatable/equatable.dart';

/// Budget period accepted by the finance budgets API.
enum FinanceBudgetPeriod {
  monthly,
  yearly,
  custom;

  static FinanceBudgetPeriod parse(String? value) => switch (value) {
    'yearly' => yearly,
    'custom' => custom,
    _ => monthly,
  };
}

/// Spending health of a budget, derived from its spent amount, limit and
/// alert threshold.
enum FinanceBudgetHealth { onTrack, nearLimit, over }

/// A workspace spending budget (`finance_budgets`). Amounts are in the
/// workspace currency; `spent` is maintained by the server.
class FinanceBudget extends Equatable {
  const FinanceBudget({
    required this.id,
    required this.name,
    required this.amount,
    required this.startDate,
    this.spent = 0,
    this.period = FinanceBudgetPeriod.monthly,
    this.description,
    this.endDate,
    this.alertThreshold,
    this.categoryId,
    this.walletId,
  });

  factory FinanceBudget.fromJson(Map<String, dynamic> json) => FinanceBudget(
    id: json['id'] as String,
    name: (json['name'] as String?)?.trim() ?? '',
    description: json['description'] as String?,
    amount: (json['amount'] as num?)?.toDouble() ?? 0,
    spent: (json['spent'] as num?)?.toDouble() ?? 0,
    period: FinanceBudgetPeriod.parse(json['period'] as String?),
    startDate: _parseDate(json['start_date']) ?? DateTime(1970),
    endDate: _parseDate(json['end_date']),
    alertThreshold: (json['alert_threshold'] as num?)?.toDouble(),
    categoryId: json['category_id'] as String?,
    walletId: json['wallet_id'] as String?,
  );

  final String id;
  final String name;
  final String? description;
  final double amount;
  final double spent;
  final FinanceBudgetPeriod period;
  final DateTime startDate;
  final DateTime? endDate;

  /// Percentage (0-100) at which the budget counts as near its limit. The
  /// server stores 80 when the client sends none.
  final double? alertThreshold;
  final String? categoryId;
  final String? walletId;

  double get effectiveThreshold => alertThreshold ?? 80;

  double get remaining => amount - spent;

  /// Spent share of the limit; 0 for a zero limit with nothing spent.
  double get progress {
    if (amount <= 0) return spent > 0 ? 1 : 0;
    return spent / amount;
  }

  FinanceBudgetHealth get health {
    if (spent > amount) return FinanceBudgetHealth.over;
    if (progress * 100 >= effectiveThreshold) {
      return FinanceBudgetHealth.nearLimit;
    }
    return FinanceBudgetHealth.onTrack;
  }

  /// Request body for create and update.
  Map<String, dynamic> toPayload() => {
    'name': name,
    'description': description,
    'amount': amount,
    'period': period.name,
    'start_date': formatBudgetDate(startDate),
    'end_date': endDate == null ? null : formatBudgetDate(endDate!),
    'alert_threshold': alertThreshold,
    'category_id': categoryId,
    'wallet_id': walletId,
  };

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    amount,
    spent,
    period,
    startDate,
    endDate,
    alertThreshold,
    categoryId,
    walletId,
  ];
}

/// `YYYY-MM-DD`, the date-only form the budgets API validates.
String formatBudgetDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

DateTime? _parseDate(Object? value) {
  if (value is! String || value.isEmpty) return null;
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return null;
  return DateTime(parsed.year, parsed.month, parsed.day);
}

/// How far one budget has used its limit, from the server's status check.
class FinanceBudgetStatus extends Equatable {
  const FinanceBudgetStatus({
    required this.budgetId,
    required this.name,
    required this.percentageUsed,
    this.isOverBudget = false,
    this.isNearThreshold = false,
  });

  factory FinanceBudgetStatus.fromJson(Map<String, dynamic> json) =>
      FinanceBudgetStatus(
        budgetId: json['budget_id'] as String? ?? '',
        name: json['budget_name'] as String? ?? '',
        percentageUsed: switch (json['percentage_used']) {
          final num value => value.toDouble(),
          final String value => double.tryParse(value) ?? 0,
          _ => 0,
        },
        isOverBudget: json['is_over_budget'] == true,
        isNearThreshold: json['is_near_threshold'] == true,
      );

  final String budgetId;
  final String name;
  final double percentageUsed;
  final bool isOverBudget;
  final bool isNearThreshold;

  @override
  List<Object?> get props => [
    budgetId,
    name,
    percentageUsed,
    isOverBudget,
    isNearThreshold,
  ];
}
