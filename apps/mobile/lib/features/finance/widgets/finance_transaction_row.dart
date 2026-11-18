import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/kit/app_rich_row.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/utils/transaction_icon.dart';
import 'package:mobile/features/finance/widgets/finance_hue.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// Title shown for a transaction: its description, else its category or
/// wallet.
String financeTransactionTitle(Transaction transaction) {
  final description = transaction.description?.trim();
  if (description != null && description.isNotEmpty) return description;
  return transaction.categoryName ?? transaction.walletName ?? '—';
}

/// One transaction: category hue tile, title, "category · wallet" and the
/// signed amount in the wallet currency (masked while amounts are hidden).
/// Money in reads in the success colour.
class FinanceTransactionRow extends StatelessWidget {
  const FinanceTransactionRow({
    required this.transaction,
    required this.fallbackCurrency,
    this.exchangeRates = const [],
    this.onTap,
    super.key,
  });

  final Transaction transaction;

  /// Currency used when the row carries no wallet currency.
  final String fallbackCurrency;
  final List<ExchangeRate> exchangeRates;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final amount = transaction.amount;
    final colors = context.tokens.colorScheme;
    final currency = transaction.walletCurrency ?? fallbackCurrency;
    final visible = financeAmountsVisible(context);
    final converted =
        visible &&
            amount != null &&
            currency.toUpperCase() != fallbackCurrency.toUpperCase()
        ? convertCurrency(amount, currency, fallbackCurrency, exchangeRates)
        : null;
    final time = transaction.takenAt ?? transaction.createdAt;
    final subtitle = [
      if (transaction.isTransfer)
        l10n.financeTransfer
      else
        transaction.categoryName,
      transaction.walletName,
      if (time != null)
        MaterialLocalizations.of(
          context,
        ).formatTimeOfDay(TimeOfDay.fromDateTime(time.toLocal())),
    ].nonNulls.where((value) => value.trim().isNotEmpty).join(' · ');
    return AppRichRow(
      key: ValueKey('finance-transaction-${transaction.id}'),
      leading: FinanceHueTile(
        icon: resolveTransactionCategoryIcon(transaction),
        hue: financeTransactionHueName(transaction),
      ),
      title: financeTransactionTitle(transaction),
      subtitle: subtitle.isEmpty ? null : subtitle,
      trailing: amount == null
          ? Text(
              financeMaskedAmountPlaceholder,
              style: context.tokens.typography.numeric,
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                FinanceAmountText(
                  amount,
                  currency,
                  signed: !transaction.isTransfer,
                  color: visible && amount > 0 && !transaction.isTransfer
                      ? colors.success
                      : null,
                  style: context.tokens.typography.numeric.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (converted != null)
                  FinanceAmountText(
                    converted,
                    fallbackCurrency,
                    approximate: true,
                    style: context.tokens.typography.caption,
                  ),
              ],
            ),
      onTap: onTap,
    );
  }
}

/// Transactions of one local calendar day, newest day first.
typedef FinanceDayGroup = ({DateTime day, List<Transaction> transactions});

List<FinanceDayGroup> groupTransactionsByDay(Iterable<Transaction> items) {
  final groups = <DateTime, List<Transaction>>{};
  for (final transaction in items) {
    final at = (transaction.takenAt ?? transaction.createdAt)?.toLocal();
    final day = at == null
        ? DateTime(1970)
        : DateTime(at.year, at.month, at.day);
    (groups[day] ??= []).add(transaction);
  }
  final days = groups.keys.toList()..sort((a, b) => b.compareTo(a));
  return [for (final day in days) (day: day, transactions: groups[day]!)];
}

/// "Today", "Yesterday" or a short weekday date such as "Mon, 16 Nov".
String financeDayLabel(BuildContext context, DateTime day, {DateTime? now}) {
  final today = now ?? DateTime.now();
  final start = DateTime(today.year, today.month, today.day);
  final difference = start.difference(day).inDays;
  if (difference == 0) return context.l10n.financeToday;
  if (difference == 1) return context.l10n.financeYesterday;
  final locale = Localizations.localeOf(context).toString();
  final sameYear = day.year == today.year;
  return (sameYear
          ? DateFormat('EEE, d MMM', locale)
          : DateFormat('EEE, d MMM y', locale))
      .format(day);
}

/// Net of a day's non-transfer transactions per currency, joined with " · "
/// so different currencies are never added together.
String financeDayNet(List<Transaction> transactions, String fallbackCurrency) {
  final totals = <String, double>{};
  for (final transaction in transactions) {
    final amount = transaction.amount;
    if (amount == null || transaction.isTransfer) continue;
    final currency = (transaction.walletCurrency ?? fallbackCurrency)
        .toUpperCase();
    totals[currency] = (totals[currency] ?? 0) + amount;
  }
  return [
    for (final entry in totals.entries)
      formatFinanceAmount(entry.value, entry.key, signed: true),
  ].join(' · ');
}

/// Overline above a day's card: the day label and, when [showNet], the
/// masked per-currency net on the trailing edge.
class FinanceDayHeader extends StatelessWidget {
  const FinanceDayHeader({
    required this.group,
    required this.fallbackCurrency,
    this.showNet = true,
    this.now,
    super.key,
  });

  final FinanceDayGroup group;
  final String fallbackCurrency;
  final bool showNet;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final style = tokens.typography.caption.copyWith(
      color: tokens.colorScheme.mutedForeground,
      fontWeight: FontWeight.w700,
    );
    final net = showNet
        ? financeDayNet(group.transactions, fallbackCurrency)
        : '';
    final visible = financeAmountsVisible(context);
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.xs,
        AppSpacing.md,
        AppSpacing.xs,
        AppSpacing.sm,
      ),
      child: Row(
        spacing: AppSpacing.sm,
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                financeDayLabel(context, group.day, now: now),
                style: style,
              ),
            ),
          ),
          if (net.isNotEmpty && visible)
            Flexible(
              child: Text(
                net,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.numeric.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
