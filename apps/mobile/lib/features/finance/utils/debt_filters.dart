import 'package:mobile/data/models/finance/debt_loan.dart';

/// [debts] of [type] (null for both) and [status] (null for every status),
/// overdue first, then by the nearest due date, then by name.
List<DebtLoan> visibleDebts(
  Iterable<DebtLoan> debts, {
  required DebtLoanType? type,
  required DebtLoanStatus? status,
  required DateTime now,
}) {
  int compare(DebtLoan a, DebtLoan b) {
    final overdue = (b.isOverdue(now) ? 1 : 0) - (a.isOverdue(now) ? 1 : 0);
    if (overdue != 0) return overdue;
    final active =
        (b.status == DebtLoanStatus.active ? 1 : 0) -
        (a.status == DebtLoanStatus.active ? 1 : 0);
    if (active != 0) return active;
    final due = switch ((a.dueDate, b.dueDate)) {
      (null, null) => 0,
      (null, _) => 1,
      (_, null) => -1,
      (final x?, final y?) => x.compareTo(y),
    };
    if (due != 0) return due;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  }

  return debts
      .where(
        (debt) =>
            (type == null || debt.type == type) &&
            (status == null || debt.status == status),
      )
      .toList()
    ..sort(compare);
}
