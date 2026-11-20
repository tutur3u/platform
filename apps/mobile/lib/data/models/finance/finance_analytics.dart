import 'package:equatable/equatable.dart';

double _number(Object? value) => switch (value) {
  final num number => number.toDouble(),
  final String text => double.tryParse(text) ?? 0,
  _ => 0,
};

/// A chart period key: `2026-11-20`, `2026-11` or a full timestamp.
DateTime? financeAnalyticsDate(Object? value) {
  if (value is! String || value.isEmpty) return null;
  final text = RegExp(r'^\d{4}-\d{2}$').hasMatch(value) ? '$value-01' : value;
  final parsed = DateTime.tryParse(text);
  return parsed == null
      ? null
      : DateTime(parsed.year, parsed.month, parsed.day);
}

/// Money in and out of one chart interval.
class FinanceFlowPoint extends Equatable {
  const FinanceFlowPoint({
    required this.date,
    required this.income,
    required this.expense,
  });

  final DateTime date;
  final double income;

  /// Money out as a positive amount.
  final double expense;

  @override
  List<Object?> get props => [date, income, expense];
}

/// Workspace income and expense over a range, with the balance before and
/// after it, in the workspace currency.
class FinanceIncomeExpenseSummary extends Equatable {
  const FinanceIncomeExpenseSummary({
    this.points = const [],
    this.totalIncome = 0,
    this.totalExpense = 0,
    this.netTotal = 0,
    this.openingBalance = 0,
    this.closingBalance = 0,
    this.averageIncome = 0,
    this.averageExpense = 0,
  });

  factory FinanceIncomeExpenseSummary.fromJson(Map<String, dynamic> json) =>
      FinanceIncomeExpenseSummary(
        points: [
          for (final row
              in (json['data'] as List<dynamic>? ?? const [])
                  .whereType<Map<String, dynamic>>())
            if (financeAnalyticsDate(row['period']) case final date?)
              FinanceFlowPoint(
                date: date,
                income: _number(row['total_income']),
                expense: _number(row['total_expense']).abs(),
              ),
        ],
        totalIncome: _number(json['total_income']),
        totalExpense: _number(json['total_expense']).abs(),
        netTotal: _number(json['net_total']),
        openingBalance: _number(json['opening_balance']),
        closingBalance: _number(json['closing_balance']),
        averageIncome: _number(json['average_income']),
        averageExpense: _number(json['average_expense']).abs(),
      );

  final List<FinanceFlowPoint> points;
  final double totalIncome;
  final double totalExpense;
  final double netTotal;
  final double openingBalance;
  final double closingBalance;
  final double averageIncome;
  final double averageExpense;

  @override
  List<Object?> get props => [
    points,
    totalIncome,
    totalExpense,
    netTotal,
    openingBalance,
    closingBalance,
    averageIncome,
    averageExpense,
  ];
}

/// One category's total over a range, summed across the chart intervals.
class FinanceCategoryTotal extends Equatable {
  const FinanceCategoryTotal({
    required this.id,
    required this.name,
    required this.total,
    this.color,
    this.icon,
  });

  final String id;
  final String? name;
  final double total;
  final String? color;
  final String? icon;

  /// Sums per-interval breakdown rows by category, largest first.
  static List<FinanceCategoryTotal> fromBreakdown(Iterable<Object?> rows) {
    final totals = <String, FinanceCategoryTotal>{};
    for (final row in rows.whereType<Map<String, dynamic>>()) {
      final id = row['category_id'] as String? ?? '';
      final previous = totals[id];
      totals[id] = FinanceCategoryTotal(
        id: id,
        name: row['category_name'] as String? ?? previous?.name,
        color: row['category_color'] as String? ?? previous?.color,
        icon: row['category_icon'] as String? ?? previous?.icon,
        total: (previous?.total ?? 0) + _number(row['total']).abs(),
      );
    }
    return totals.values.where((total) => total.total > 0).toList()
      ..sort((a, b) => b.total.compareTo(a.total));
  }

  @override
  List<Object?> get props => [id, name, total, color, icon];
}

/// Workspace balance at one date.
class FinanceBalancePoint extends Equatable {
  const FinanceBalancePoint({required this.date, required this.balance});

  final DateTime date;
  final double balance;

  @override
  List<Object?> get props => [date, balance];
}
