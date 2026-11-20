import 'package:equatable/equatable.dart';

/// Money the workspace owes ([debt]) or is owed ([loan]).
enum DebtLoanType { debt, loan }

enum DebtLoanStatus { active, paid, defaulted, cancelled }

enum DebtInterestType { simple, compound }

T? _byName<T extends Enum>(List<T> values, Object? name) =>
    values.where((value) => value.name == name).firstOrNull;

double _number(Object? value) => switch (value) {
  final num number => number.toDouble(),
  final String text => double.tryParse(text) ?? 0,
  _ => 0,
};

DateTime? _date(Object? value) =>
    value is String && value.isNotEmpty ? DateTime.tryParse(value) : null;

String _day(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

/// A debt or loan with the balance the server derives from its linked
/// repayments.
class DebtLoan extends Equatable {
  const DebtLoan({
    required this.id,
    required this.name,
    required this.type,
    required this.principalAmount,
    required this.currency,
    required this.startDate,
    this.status = DebtLoanStatus.active,
    this.description,
    this.counterparty,
    this.interestRate,
    this.interestType,
    this.dueDate,
    this.walletId,
    this.totalPaid = 0,
    this.totalInterestPaid = 0,
    double? remainingBalance,
    this.progressPercentage = 0,
  }) : remainingBalance = remainingBalance ?? principalAmount;

  factory DebtLoan.fromJson(Map<String, dynamic> json) => DebtLoan(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    type: _byName(DebtLoanType.values, json['type']) ?? DebtLoanType.debt,
    principalAmount: _number(json['principal_amount']),
    currency: json['currency'] as String? ?? '',
    startDate: _date(json['start_date']) ?? DateTime(1970),
    status:
        _byName(DebtLoanStatus.values, json['status']) ?? DebtLoanStatus.active,
    description: json['description'] as String?,
    counterparty: json['counterparty'] as String?,
    interestRate: json['interest_rate'] == null
        ? null
        : _number(json['interest_rate']),
    interestType: _byName(DebtInterestType.values, json['interest_type']),
    dueDate: _date(json['due_date']),
    walletId: json['wallet_id'] as String?,
    totalPaid: _number(json['total_paid']),
    totalInterestPaid: _number(json['total_interest_paid']),
    remainingBalance: json['remaining_balance'] == null
        ? null
        : _number(json['remaining_balance']),
    progressPercentage: _number(json['progress_percentage']),
  );

  final String id;
  final String name;
  final DebtLoanType type;
  final double principalAmount;
  final String currency;
  final DateTime startDate;
  final DebtLoanStatus status;
  final String? description;
  final String? counterparty;

  /// Annual rate in percent.
  final double? interestRate;
  final DebtInterestType? interestType;
  final DateTime? dueDate;
  final String? walletId;
  final double totalPaid;
  final double totalInterestPaid;
  final double remainingBalance;

  /// Share of the principal repaid, 0 to 100.
  final double progressPercentage;

  /// Active and past its due date as of [now].
  bool isOverdue(DateTime now) {
    final due = dueDate;
    return status == DebtLoanStatus.active &&
        due != null &&
        DateTime(
          due.year,
          due.month,
          due.day,
        ).isBefore(DateTime(now.year, now.month, now.day));
  }

  /// Body for create and update: dates as calendar days, blanks as null.
  Map<String, dynamic> toPayload() => {
    'name': name,
    'type': type.name,
    'principal_amount': principalAmount,
    'currency': currency,
    'start_date': _day(startDate),
    'status': status.name,
    'description': description,
    'counterparty': counterparty,
    'interest_rate': interestRate,
    'interest_type': interestType?.name,
    'due_date': dueDate == null ? null : _day(dueDate!),
    'wallet_id': walletId,
  };

  @override
  List<Object?> get props => [
    id,
    name,
    type,
    principalAmount,
    currency,
    startDate,
    status,
    description,
    counterparty,
    interestRate,
    interestType,
    dueDate,
    walletId,
    totalPaid,
    totalInterestPaid,
    remainingBalance,
    progressPercentage,
  ];
}

/// Workspace totals across debts and loans, in the workspace currency.
class DebtLoanSummary extends Equatable {
  const DebtLoanSummary({
    this.activeDebtCount = 0,
    this.activeLoanCount = 0,
    this.totalDebtRemaining = 0,
    this.totalLoanRemaining = 0,
    this.netPosition = 0,
  });

  factory DebtLoanSummary.fromJson(Map<String, dynamic> json) =>
      DebtLoanSummary(
        activeDebtCount: _number(json['active_debt_count']).round(),
        activeLoanCount: _number(json['active_loan_count']).round(),
        totalDebtRemaining: _number(json['total_debt_remaining']),
        totalLoanRemaining: _number(json['total_loan_remaining']),
        netPosition: _number(json['net_position']),
      );

  final int activeDebtCount;
  final int activeLoanCount;
  final double totalDebtRemaining;
  final double totalLoanRemaining;

  /// Owed to the workspace minus owed by it.
  final double netPosition;

  @override
  List<Object?> get props => [
    activeDebtCount,
    activeLoanCount,
    totalDebtRemaining,
    totalLoanRemaining,
    netPosition,
  ];
}
