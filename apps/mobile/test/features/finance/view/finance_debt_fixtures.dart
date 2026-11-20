import 'package:mobile/data/models/finance/debt_loan.dart';
import 'package:mobile/data/repositories/finance_debts_repository.dart';

DebtLoan financeSceneDebt(
  String name, {
  DebtLoanType type = DebtLoanType.debt,
  DebtLoanStatus status = DebtLoanStatus.active,
  DateTime? due,
  double principal = 1000000,
  double paid = 250000,
}) => DebtLoan(
  id: name,
  name: name,
  type: type,
  principalAmount: principal,
  currency: 'VND',
  startDate: DateTime(2026),
  status: status,
  dueDate: due,
  counterparty: 'Minh',
  totalPaid: paid,
  remainingBalance: principal - paid,
  progressPercentage: paid / principal * 100,
);

/// Debts and loans for scenes: an overdue debt, a debt due later, a loan
/// and a debt already paid off.
final List<DebtLoan> financeSceneDebts = [
  financeSceneDebt('Car loan', due: DateTime(2027, 3)),
  financeSceneDebt('Rent', due: DateTime(2026, 11, 10)),
  financeSceneDebt(
    'Lent to Lan',
    type: DebtLoanType.loan,
    principal: 500000,
    paid: 100000,
  ),
  financeSceneDebt('Old card', status: DebtLoanStatus.paid, paid: 1000000),
];

/// In-memory debts that record every write.
class FinanceSceneDebtsRepository extends FinanceDebtsRepository {
  FinanceSceneDebtsRepository([List<DebtLoan>? rows])
    : rows = rows ?? financeSceneDebts;

  final List<DebtLoan> rows;
  final calls = <String>[];

  @override
  Future<List<DebtLoan>> list(String wsId, {bool forceRefresh = false}) async =>
      rows;

  @override
  Future<DebtLoanSummary> summary(
    String wsId, {
    bool forceRefresh = false,
  }) async => const DebtLoanSummary(
    activeDebtCount: 2,
    activeLoanCount: 1,
    totalDebtRemaining: 1500000,
    totalLoanRemaining: 400000,
    netPosition: -1100000,
  );

  @override
  Future<DebtLoan> create(String wsId, DebtLoan debt) async {
    calls.add('create:${debt.name}:${debt.type.name}:${debt.principalAmount}');
    return debt;
  }

  @override
  Future<void> update(String wsId, DebtLoan debt) async =>
      calls.add('update:${debt.id}');

  @override
  Future<void> setStatus(String wsId, String id, DebtLoanStatus status) async =>
      calls.add('status:$id:${status.name}');

  @override
  Future<void> delete(String wsId, String id) async => calls.add('delete:$id');
}
