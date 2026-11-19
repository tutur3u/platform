import 'package:mobile/data/models/finance/budget.dart';

/// Last day (inclusive) of [budget]'s period that contains [now]: the end of
/// the month or year, or a custom budget's end date.
DateTime budgetPeriodEnd(FinanceBudget budget, DateTime now) =>
    switch (budget.period) {
      FinanceBudgetPeriod.monthly => DateTime(now.year, now.month + 1, 0),
      FinanceBudgetPeriod.yearly => DateTime(now.year, 12, 31),
      FinanceBudgetPeriod.custom =>
        budget.endDate ?? DateTime(now.year, now.month + 1, 0),
    };

/// First day of [budget]'s period that contains [now].
DateTime budgetPeriodStart(FinanceBudget budget, DateTime now) =>
    switch (budget.period) {
      FinanceBudgetPeriod.monthly => DateTime(now.year, now.month),
      FinanceBudgetPeriod.yearly => DateTime(now.year),
      FinanceBudgetPeriod.custom => budget.startDate,
    };

/// Days left in the period, counting today; 0 once it has ended.
int budgetDaysLeft(FinanceBudget budget, DateTime now) =>
    daysLeftUntil(budgetPeriodEnd(budget, now), now);

/// Days from [now] through [end], counting today; 0 once [end] has passed.
int daysLeftUntil(DateTime end, DateTime now) {
  // UTC dates keep daylight-saving shifts out of the day count.
  final days =
      DateTime.utc(
        end.year,
        end.month,
        end.day,
      ).difference(DateTime.utc(now.year, now.month, now.day)).inDays +
      1;
  return days < 0 ? 0 : days;
}

/// What can still be spent per remaining day, or null when nothing is left
/// or the period has ended.
double? budgetPerDay(FinanceBudget budget, DateTime now) {
  final days = budgetDaysLeft(budget, now);
  if (days <= 0 || budget.remaining <= 0) return null;
  return budget.remaining / days;
}
