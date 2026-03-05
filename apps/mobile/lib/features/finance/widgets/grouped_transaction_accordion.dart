import 'package:flutter/material.dart' hide Card;
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart' as lucide;
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/utils/transaction_icon.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

typedef TransactionTapCallback = Future<void> Function(Transaction transaction);

class GroupedTransactionAccordion extends StatefulWidget {
  const GroupedTransactionAccordion({
    required this.transactions,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.onTransactionTap,
    this.showLoadingMore = false,
    this.lazy = false,
    this.scrollController,
    this.listPadding,
    this.scrollPhysics,
    super.key,
  });

  final List<Transaction> transactions;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final TransactionTapCallback onTransactionTap;
  final bool showLoadingMore;
  final bool lazy;
  final ScrollController? scrollController;
  final EdgeInsetsGeometry? listPadding;
  final ScrollPhysics? scrollPhysics;

  @override
  State<GroupedTransactionAccordion> createState() =>
      _GroupedTransactionAccordionState();
}

class _GroupedTransactionAccordionState
    extends State<GroupedTransactionAccordion> {
  final Map<String, bool> _expandedDays = {};

  bool _isDayExpanded(String key) => _expandedDays[key] ?? true;

  void _toggleDay(String key) {
    setState(() {
      _expandedDays[key] = !(_expandedDays[key] ?? true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final groups = _groupByDate(
      widget.transactions,
      context.l10n,
      widget.workspaceCurrency,
      widget.exchangeRates,
    );

    if (widget.lazy) {
      final itemCount = groups.length + (widget.showLoadingMore ? 1 : 0);
      return ListView.builder(
        controller: widget.scrollController,
        padding: widget.listPadding,
        physics: widget.scrollPhysics ?? const AlwaysScrollableScrollPhysics(),
        itemCount: itemCount,
        itemBuilder: (context, index) {
          if (index >= groups.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: shad.CircularProgressIndicator(),
              ),
            );
          }

          final group = groups[index];
          return _DayGroup(
            group: group,
            isExpanded: _isDayExpanded(group.key),
            onToggle: () => _toggleDay(group.key),
            workspaceCurrency: widget.workspaceCurrency,
            exchangeRates: widget.exchangeRates,
            onTransactionTap: widget.onTransactionTap,
          );
        },
      );
    }

    return Column(
      children: [
        for (final group in groups)
          _DayGroup(
            group: group,
            isExpanded: _isDayExpanded(group.key),
            onToggle: () => _toggleDay(group.key),
            workspaceCurrency: widget.workspaceCurrency,
            exchangeRates: widget.exchangeRates,
            onTransactionTap: widget.onTransactionTap,
          ),
        if (widget.showLoadingMore)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: shad.CircularProgressIndicator(),
            ),
          ),
      ],
    );
  }
}

class _DailyStats {
  _DailyStats({
    required this.income,
    required this.expense,
    required this.count,
    required this.hasConvertedAmounts,
  });

  final double income;
  final double expense;
  final int count;
  final bool hasConvertedAmounts;
  double get netTotal => income + expense;
}

class _DateGroup {
  _DateGroup({
    required this.key,
    required this.fullLabel,
    required this.transactions,
    required this.stats,
  });

  final String key;
  final String fullLabel;
  final List<Transaction> transactions;
  final _DailyStats stats;
}

List<_DateGroup> _groupByDate(
  List<Transaction> transactions,
  AppLocalizations l10n,
  String workspaceCurrency,
  List<ExchangeRate> exchangeRates,
) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
  final shortFormat = DateFormat.MMMd();
  final fullFormat = DateFormat('EEEE, dd MMMM yyyy');

  final orderedKeys = <String>[];
  final groups = <String, List<Transaction>>{};
  final fullLabels = <String, String>{};

  for (final tx in transactions) {
    final date = tx.takenAt ?? tx.createdAt ?? now;
    final day = DateTime(date.year, date.month, date.day);
    final key =
        '${day.year}-${day.month.toString().padLeft(2, '0')}'
        '-${day.day.toString().padLeft(2, '0')}';

    if (!groups.containsKey(key)) {
      orderedKeys.add(key);
      groups[key] = [];
      if (day == today) {
        fullLabels[key] = l10n.financeToday;
      } else if (day == yesterday) {
        fullLabels[key] = l10n.financeYesterday;
      } else {
        final shortLabel = shortFormat.format(day);
        final fullLabel = fullFormat.format(day);
        fullLabels[key] = fullLabel.isEmpty ? shortLabel : fullLabel;
      }
    }
    groups[key]!.add(tx);
  }

  return orderedKeys.map((key) {
    final txList = groups[key]!;
    double income = 0;
    double expense = 0;
    var hasConvertedAmounts = false;

    for (final tx in txList) {
      final amount = tx.amount ?? 0;
      final walletCurrency = tx.walletCurrency ?? workspaceCurrency;
      final isWorkspaceCurrency =
          walletCurrency.toUpperCase() == workspaceCurrency.toUpperCase();
      final converted = convertCurrency(
        amount,
        walletCurrency,
        workspaceCurrency,
        exchangeRates,
      );

      if (!isWorkspaceCurrency) {
        hasConvertedAmounts = true;
        if (converted == null) {
          // Do not mix source currency amounts into workspace-currency totals.
          continue;
        }
      }
      final convertedAmount = isWorkspaceCurrency ? amount : converted!;

      if (convertedAmount >= 0) {
        income += convertedAmount;
      } else {
        expense += convertedAmount;
      }
    }

    return _DateGroup(
      key: key,
      fullLabel: fullLabels[key]!,
      transactions: txList,
      stats: _DailyStats(
        income: income,
        expense: expense,
        count: txList.length,
        hasConvertedAmounts: hasConvertedAmounts,
      ),
    );
  }).toList();
}

class _DayGroup extends StatelessWidget {
  const _DayGroup({
    required this.group,
    required this.isExpanded,
    required this.onToggle,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.onTransactionTap,
  });

  final _DateGroup group;
  final bool isExpanded;
  final VoidCallback onToggle;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final TransactionTapCallback onTransactionTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final colorScheme = theme.colorScheme;
    final stats = group.stats;
    final approximatePrefix = stats.hasConvertedAmounts ? '≈ ' : '';
    final incomeFormatted = formatCurrency(stats.income, workspaceCurrency);
    final expenseFormatted = formatCurrency(stats.expense, workspaceCurrency);
    final netFormatted = formatCurrency(stats.netTotal, workspaceCurrency);
    final incomeText = stats.income > 0
        ? '$approximatePrefix+$incomeFormatted'
        : null;
    final expenseText = stats.expense < 0
        ? '$approximatePrefix$expenseFormatted'
        : null;
    final netText = stats.netTotal >= 0
        ? '$approximatePrefix+$netFormatted'
        : '$approximatePrefix$netFormatted';
    final netColor = stats.netTotal >= 0
        ? colorScheme.primary
        : colorScheme.destructive;

    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InkWell(
                onTap: onToggle,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(2, 2, 2, 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              group.fullLabel,
                              style: theme.typography.small.copyWith(
                                fontWeight: FontWeight.w700,
                                color: colorScheme.foreground,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: colorScheme.muted,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              '${stats.count} '
                              '${l10n.financeTransactionCountShort}',
                              style: theme.typography.xSmall.copyWith(
                                color: colorScheme.mutedForeground,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Icon(
                            isExpanded ? Icons.expand_less : Icons.expand_more,
                            size: 18,
                            color: colorScheme.mutedForeground,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: Wrap(
                              spacing: 8,
                              runSpacing: 2,
                              children: [
                                if (incomeText != null)
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.arrow_upward,
                                        size: 12,
                                        color: Colors.green,
                                      ),
                                      const SizedBox(width: 2),
                                      Text(
                                        incomeText,
                                        style: theme.typography.xSmall.copyWith(
                                          color: Colors.green,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                if (expenseText != null)
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.arrow_downward,
                                        size: 12,
                                        color: colorScheme.destructive,
                                      ),
                                      const SizedBox(width: 2),
                                      Text(
                                        expenseText,
                                        style: theme.typography.xSmall.copyWith(
                                          color: colorScheme.destructive,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '${l10n.financeNet}  ',
                                style: theme.typography.xSmall.copyWith(
                                  color: colorScheme.mutedForeground,
                                ),
                              ),
                              ConstrainedBox(
                                constraints: const BoxConstraints(
                                  maxWidth: 112,
                                ),
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerRight,
                                  child: Text(
                                    netText,
                                    style: theme.typography.xSmall.copyWith(
                                      color: netColor,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeInOut,
                child: isExpanded
                    ? Column(
                        children: [
                          for (
                            var i = 0;
                            i < group.transactions.length;
                            i++
                          ) ...[
                            _TransactionTile(
                              transaction: group.transactions[i],
                              workspaceCurrency: workspaceCurrency,
                              exchangeRates: exchangeRates,
                              onTap: () =>
                                  onTransactionTap(group.transactions[i]),
                            ),
                            if (i < group.transactions.length - 1)
                              const SizedBox(height: 8),
                          ],
                          const SizedBox(height: 4),
                        ],
                      )
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({
    required this.transaction,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.onTap,
  });

  final Transaction transaction;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final VoidCallback onTap;

  Color? _parseHex(String? hex) {
    if (hex == null) return null;
    final cleaned = hex.replaceFirst('#', '');
    if (cleaned.length != 6 && cleaned.length != 8) return null;
    final value = int.tryParse(
      cleaned.length == 6 ? 'FF$cleaned' : cleaned,
      radix: 16,
    );
    return value != null ? Color(value) : null;
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final amount = transaction.amount ?? 0;
    final isExpense = amount < 0;
    final currency = transaction.walletCurrency ?? workspaceCurrency;
    final convertedAmount = convertCurrency(
      amount,
      currency,
      workspaceCurrency,
      exchangeRates,
    );
    final showConvertedAmount =
        convertedAmount != null &&
        currency.toUpperCase() != workspaceCurrency.toUpperCase();

    final hasDescription = transaction.description?.isNotEmpty ?? false;
    final title = hasDescription
        ? transaction.description!
        : (transaction.categoryName ?? '—');

    final categoryColor =
        _parseHex(transaction.categoryColor) ??
        (isExpense ? colorScheme.destructive : colorScheme.primary);

    final amountText = isExpense
        ? formatCurrency(amount, currency)
        : '+${formatCurrency(amount, currency)}';
    final convertedAmountText = showConvertedAmount
        ? (convertedAmount >= 0
              ? '≈ +${formatCurrency(convertedAmount, workspaceCurrency)}'
              : '≈ ${formatCurrency(convertedAmount, workspaceCurrency)}')
        : null;

    final categoryIcon = resolveTransactionCategoryIcon(transaction);

    return shad.Card(
      padding: EdgeInsets.zero,
      borderColor: categoryColor.withValues(alpha: 0.35),
      borderWidth: 1,
      child: shad.GhostButton(
        onPressed: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: categoryColor.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    categoryIcon,
                    size: 17,
                    color: categoryColor,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.p.copyWith(
                        fontWeight: FontWeight.w500,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        if (transaction.categoryName != null)
                          _Chip(
                            label: transaction.categoryName!,
                            icon: categoryIcon,
                            color: categoryColor,
                          ),
                        if (transaction.walletName != null)
                          _Chip(
                            label: transaction.walletName!,
                            leading: WalletVisualAvatar(
                              icon: transaction.walletIcon,
                              imageSrc: transaction.walletImageSrc,
                              fallbackIcon: lucide.LucideIcons.walletCards,
                              size: 14,
                            ),
                          ),
                        if (transaction.isTransfer &&
                            transaction.transfer != null)
                          _Chip(
                            label: transaction.transfer!.linkedWalletName,
                            icon: lucide.LucideIcons.repeat2,
                            color: colorScheme.ring,
                          ),
                      ],
                    ),
                    if (transaction.tags.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 4,
                        runSpacing: 2,
                        children: transaction.tags.map((tag) {
                          final tagColor = _parseHex(tag.color);
                          return Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 1,
                            ),
                            decoration: BoxDecoration(
                              color: (tagColor ?? colorScheme.ring).withValues(
                                alpha: 0.12,
                              ),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: (tagColor ?? colorScheme.ring)
                                    .withValues(
                                      alpha: 0.3,
                                    ),
                              ),
                            ),
                            child: Text(
                              tag.name,
                              style: theme.typography.xSmall.copyWith(
                                color: tagColor ?? colorScheme.mutedForeground,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 110),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerRight,
                      child: Text(
                        amountText,
                        maxLines: 1,
                        style: theme.typography.p.copyWith(
                          fontWeight: FontWeight.w700,
                          color: isExpense
                              ? colorScheme.destructive
                              : Colors.green,
                        ),
                      ),
                    ),
                    if (transaction.isTransfer)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          context.l10n.financeTransfer,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ),
                    if (convertedAmountText != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          convertedAmountText,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.icon, this.leading, this.color});

  final String label;
  final IconData? icon;
  final Widget? leading;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final effectiveColor = color ?? colorScheme.mutedForeground;

    return Container(
      constraints: const BoxConstraints(maxWidth: 140),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
      decoration: BoxDecoration(
        color: effectiveColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: effectiveColor.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[
            leading!,
            const SizedBox(width: 4),
          ] else if (icon != null) ...[
            Icon(icon, size: 11, color: effectiveColor.withValues(alpha: 0.8)),
            const SizedBox(width: 3),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.xSmall.copyWith(
                color: effectiveColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
