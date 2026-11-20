import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/recurring_transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// Active rules whose next run falls within [days] of [now], soonest first.
List<RecurringTransaction> upcomingRecurring(
  Iterable<RecurringTransaction> rules, {
  required DateTime now,
  int days = 30,
}) {
  final today = DateTime(now.year, now.month, now.day);
  final until = today.add(Duration(days: days + 1));
  return rules
      .where(
        (rule) =>
            rule.active &&
            !rule.nextOccurrence.isBefore(today) &&
            rule.nextOccurrence.isBefore(until),
      )
      .toList()
    ..sort((a, b) => a.nextOccurrence.compareTo(b.nextOccurrence));
}

/// The next 30 days of recurring runs with expected money in and out. The
/// totals show only when every run is in one currency.
class RecurringUpcomingSection extends StatelessWidget {
  const RecurringUpcomingSection({
    required this.rules,
    required this.walletById,
    required this.currency,
    required this.now,
    super.key,
  });

  final List<RecurringTransaction> rules;
  final Map<String, Wallet> walletById;
  final String currency;
  final DateTime now;

  String _currencyOf(RecurringTransaction rule) =>
      walletById[rule.draft.walletId]?.currency ?? currency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final dates = MaterialLocalizations.of(context);
    final upcoming = upcomingRecurring(rules, now: now);
    final currencies = upcoming.map(_currencyOf).toSet();
    double total(bool income) => upcoming
        .map((rule) => rule.draft.amount)
        .where((amount) => income ? amount > 0 : amount < 0)
        .fold(0, (sum, amount) => sum + amount.abs());
    return Column(
      key: const ValueKey('recurring-upcoming'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(
          title: l10n.financeRecurringUpcoming,
          count: upcoming.length,
        ),
        if (upcoming.isEmpty)
          AppStateMessage.inline(
            icon: LucideIcons.calendarCheck,
            title: l10n.financeRecurringNoneUpcoming,
          )
        else ...[
          if (currencies.length == 1) ...[
            AppStatStrip(
              items: [
                AppStatStripItem(
                  label: l10n.financeRecurringExpectedIn,
                  value: financeMoney(context, total(true), currencies.single),
                ),
                AppStatStripItem(
                  label: l10n.financeRecurringExpectedOut,
                  value: financeMoney(context, total(false), currencies.single),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          AppGroupedCard(
            children: [
              for (final rule in upcoming)
                AppRichRow(
                  key: ValueKey('upcoming-${rule.id}'),
                  leading: const AppIconTile(icon: LucideIcons.calendarClock),
                  title: rule.draft.name,
                  subtitle: dates.formatMediumDate(rule.nextOccurrence),
                  trailing: FinanceAmountText(
                    rule.draft.amount,
                    _currencyOf(rule),
                    signed: true,
                  ),
                ),
            ],
          ),
        ],
        const SizedBox(height: AppLayout.sectionGap),
        AppSectionHeader(title: l10n.financeRecurringAllRules),
      ],
    );
  }
}
