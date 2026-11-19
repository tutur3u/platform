import 'package:equatable/equatable.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';

/// Length of a finance reporting period.
enum FinancePeriodKind { week, month, year }

/// A local calendar period (start inclusive, end exclusive). Weeks start on
/// Monday.
class FinancePeriod extends Equatable {
  const FinancePeriod._(this.kind, this.start);

  /// The [kind] period containing [date].
  factory FinancePeriod.containing(FinancePeriodKind kind, DateTime date) =>
      FinancePeriod._(kind, switch (kind) {
        FinancePeriodKind.week => DateTime(
          date.year,
          date.month,
          date.day - (date.weekday - DateTime.monday),
        ),
        FinancePeriodKind.month => DateTime(date.year, date.month),
        FinancePeriodKind.year => DateTime(date.year),
      });

  final FinancePeriodKind kind;
  final DateTime start;

  DateTime get end => shift(1).start;

  /// The period [count] steps away (negative goes back).
  FinancePeriod shift(int count) => FinancePeriod._(kind, switch (kind) {
    FinancePeriodKind.week => DateTime(
      start.year,
      start.month,
      start.day + 7 * count,
    ),
    FinancePeriodKind.month => DateTime(start.year, start.month + count),
    FinancePeriodKind.year => DateTime(start.year + count),
  });

  bool contains(DateTime date) => !date.isBefore(start) && date.isBefore(end);

  FinanceTransactionQuery get query =>
      FinanceTransactionQuery(start: start, end: end);

  /// Bars the period chart draws: days for a week or month, months for a
  /// year.
  int get bucketCount => switch (kind) {
    FinancePeriodKind.week => 7,
    FinancePeriodKind.month => DateTime(start.year, start.month + 1, 0).day,
    FinancePeriodKind.year => 12,
  };

  /// Bucket of [date], or null outside the period.
  int? bucketOf(DateTime date) {
    if (!contains(date)) return null;
    return switch (kind) {
      FinancePeriodKind.year => date.month - 1,
      // UTC dates keep daylight-saving shifts out of the day count.
      _ => DateTime.utc(
        date.year,
        date.month,
        date.day,
      ).difference(DateTime.utc(start.year, start.month, start.day)).inDays,
    };
  }

  /// "16 – 22 Nov 2026", "November 2026" or "2026" in [locale].
  String label(String locale) => switch (kind) {
    FinancePeriodKind.week => () {
      final last = DateTime(start.year, start.month, start.day + 6);
      final sameMonth = last.month == start.month;
      final head = DateFormat(sameMonth ? 'd' : 'd MMM', locale).format(start);
      return '$head – ${DateFormat('d MMM y', locale).format(last)}';
    }(),
    FinancePeriodKind.month => DateFormat.yMMMM(locale).format(start),
    FinancePeriodKind.year => DateFormat.y(locale).format(start),
  };

  @override
  List<Object?> get props => [kind, start];
}

/// The calendar period [query] covers exactly, or null for all time or a
/// range that is no single week, month or year.
FinancePeriod? financePeriodOf(FinanceTransactionQuery query) {
  final start = query.start;
  if (start == null) return null;
  for (final kind in FinancePeriodKind.values) {
    final period = FinancePeriod.containing(kind, start);
    if (period.start == start && period.end == query.end) return period;
  }
  return null;
}

/// Money in and out per bucket of [period], from non-transfer rows.
({List<double> income, List<double> expense}) financePeriodBuckets(
  FinancePeriod period,
  Iterable<Transaction> transactions,
) {
  final income = List<double>.filled(period.bucketCount, 0);
  final expense = List<double>.filled(period.bucketCount, 0);
  for (final transaction in transactions) {
    final amount = transaction.amount;
    final at = (transaction.takenAt ?? transaction.createdAt)?.toLocal();
    if (amount == null || at == null || transaction.isTransfer) continue;
    final bucket = period.bucketOf(at);
    if (bucket == null || bucket >= income.length) continue;
    if (amount >= 0) {
      income[bucket] += amount;
    } else {
      expense[bucket] += -amount;
    }
  }
  return (income: income, expense: expense);
}
