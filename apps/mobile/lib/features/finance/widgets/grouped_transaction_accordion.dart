import 'package:flutter/material.dart' hide Card;
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart' as lucide;
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/utils/transaction_icon.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
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
    this.headerChildren = const [],
    this.emptyState,
    this.scrollController,
    this.listPadding,
    this.scrollPhysics,
    this.usePanelChrome = true,
    this.emphasizeTransactionRows = false,
    this.collapseBreakdownByDefault = false,
    this.compactHorizontalPadding = 16,
    this.showAmounts = false,
    super.key,
  });

  final List<Transaction> transactions;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final TransactionTapCallback onTransactionTap;
  final bool showLoadingMore;
  final bool lazy;
  final List<Widget> headerChildren;
  final Widget? emptyState;
  final ScrollController? scrollController;
  final EdgeInsetsGeometry? listPadding;
  final ScrollPhysics? scrollPhysics;
  final bool usePanelChrome;
  final bool emphasizeTransactionRows;
  final bool collapseBreakdownByDefault;
  final double compactHorizontalPadding;
  final bool showAmounts;

  @override
  State<GroupedTransactionAccordion> createState() =>
      _GroupedTransactionAccordionState();
}

class _GroupedTransactionAccordionState
    extends State<GroupedTransactionAccordion> {
  final Map<String, bool> _expandedDays = {};
  final Map<String, bool> _showingBreakdownDays = {};
  List<_DateGroup> _cachedGroups = const [];
  List<Transaction>? _lastTransactions;
  String? _lastWorkspaceCurrency;
  List<ExchangeRate>? _lastExchangeRates;
  Locale? _lastLocale;

  @override
  void initState() {
    super.initState();
    _lastTransactions = widget.transactions;
    _lastWorkspaceCurrency = widget.workspaceCurrency;
    _lastExchangeRates = widget.exchangeRates;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _recomputeGroupsIfNeeded();
  }

  @override
  void didUpdateWidget(covariant GroupedTransactionAccordion oldWidget) {
    super.didUpdateWidget(oldWidget);
    _recomputeGroupsIfNeeded();
  }

  void _recomputeGroupsIfNeeded() {
    final locale = Localizations.localeOf(context);
    final shouldRecompute =
        !identical(_lastTransactions, widget.transactions) ||
        _lastWorkspaceCurrency != widget.workspaceCurrency ||
        !identical(_lastExchangeRates, widget.exchangeRates) ||
        _lastLocale != locale;

    if (!shouldRecompute) {
      return;
    }

    _cachedGroups = _groupByDate(
      widget.transactions,
      context.l10n,
      widget.workspaceCurrency,
      widget.exchangeRates,
    );
    _lastTransactions = widget.transactions;
    _lastWorkspaceCurrency = widget.workspaceCurrency;
    _lastExchangeRates = widget.exchangeRates;
    _lastLocale = locale;
  }

  bool _isDayExpanded(String key) => _expandedDays[key] ?? true;

  void _toggleDay(String key) {
    setState(() {
      _expandedDays[key] = !(_expandedDays[key] ?? true);
    });
  }

  bool _showBreakdown(String key) => _showingBreakdownDays[key] ?? false;

  void _toggleBreakdown(String key) {
    setState(() {
      _showingBreakdownDays[key] = !(_showingBreakdownDays[key] ?? false);
    });
  }

  @override
  Widget build(BuildContext context) {
    _recomputeGroupsIfNeeded();
    final groups = _cachedGroups;
    final headerCount = widget.headerChildren.length;

    if (widget.lazy) {
      final bodyCount = groups.isEmpty
          ? (widget.emptyState == null ? 0 : 1)
          : groups.length;
      final loadingCount = widget.showLoadingMore ? 1 : 0;
      final itemCount = headerCount + bodyCount + loadingCount;

      return ListView.builder(
        controller: widget.scrollController,
        padding: widget.listPadding,
        physics: widget.scrollPhysics ?? const AlwaysScrollableScrollPhysics(),
        itemCount: itemCount,
        itemBuilder: (context, index) {
          if (index < headerCount) {
            return widget.headerChildren[index];
          }

          final bodyIndex = index - headerCount;

          if (groups.isEmpty) {
            if (widget.emptyState == null) {
              return const SizedBox.shrink();
            }

            if (bodyIndex == 0) {
              return widget.emptyState!;
            }

            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: shad.CircularProgressIndicator(),
              ),
            );
          }

          if (bodyIndex >= groups.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: shad.CircularProgressIndicator(),
              ),
            );
          }

          final group = groups[bodyIndex];
          return _DayGroup(
            group: group,
            isExpanded: _isDayExpanded(group.key),
            showsBreakdown: _showBreakdown(group.key),
            onToggle: () => _toggleDay(group.key),
            onToggleBreakdown: () => _toggleBreakdown(group.key),
            workspaceCurrency: widget.workspaceCurrency,
            exchangeRates: widget.exchangeRates,
            onTransactionTap: widget.onTransactionTap,
            usePanelChrome: widget.usePanelChrome,
            emphasizeTransactionRows: widget.emphasizeTransactionRows,
            collapseBreakdownByDefault: widget.collapseBreakdownByDefault,
            compactHorizontalPadding: widget.compactHorizontalPadding,
            showAmounts: widget.showAmounts,
          );
        },
      );
    }

    return Column(
      children: [
        ...widget.headerChildren,
        if (groups.isEmpty && widget.emptyState != null) widget.emptyState!,
        for (final group in groups)
          _DayGroup(
            group: group,
            isExpanded: _isDayExpanded(group.key),
            showsBreakdown: _showBreakdown(group.key),
            onToggle: () => _toggleDay(group.key),
            onToggleBreakdown: () => _toggleBreakdown(group.key),
            workspaceCurrency: widget.workspaceCurrency,
            exchangeRates: widget.exchangeRates,
            onTransactionTap: widget.onTransactionTap,
            usePanelChrome: widget.usePanelChrome,
            emphasizeTransactionRows: widget.emphasizeTransactionRows,
            collapseBreakdownByDefault: widget.collapseBreakdownByDefault,
            compactHorizontalPadding: widget.compactHorizontalPadding,
            showAmounts: widget.showAmounts,
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
    required this.showsBreakdown,
    required this.onToggle,
    required this.onToggleBreakdown,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.onTransactionTap,
    required this.usePanelChrome,
    required this.emphasizeTransactionRows,
    required this.collapseBreakdownByDefault,
    required this.compactHorizontalPadding,
    required this.showAmounts,
  });

  final _DateGroup group;
  final bool isExpanded;
  final bool showsBreakdown;
  final VoidCallback onToggle;
  final VoidCallback onToggleBreakdown;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final TransactionTapCallback onTransactionTap;
  final bool usePanelChrome;
  final bool emphasizeTransactionRows;
  final bool collapseBreakdownByDefault;
  final double compactHorizontalPadding;
  final bool showAmounts;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final palette = FinancePalette.of(context);
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
    final netColor = stats.netTotal >= 0 ? palette.positive : palette.negative;
    final displayedIncomeText = showAmounts ? incomeText : _maskedAmountText();
    final displayedExpenseText = showAmounts
        ? expenseText
        : _maskedAmountText();
    final displayedNetText = showAmounts ? netText : _maskedAmountText();
    final summaryBody = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: onToggle,
          borderRadius: BorderRadius.circular(usePanelChrome ? 16 : 0),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              compactHorizontalPadding,
              usePanelChrome ? 0 : 16,
              compactHorizontalPadding,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        group.fullLabel,
                        style: theme.typography.large.copyWith(
                          fontWeight: FontWeight.w800,
                          color: colorScheme.foreground,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: colorScheme.muted.withValues(alpha: 0.28),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${stats.count} ${l10n.financeTransactionCountShort}',
                        style: theme.typography.xSmall.copyWith(
                          color: colorScheme.mutedForeground,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(
                      isExpanded
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      size: 22,
                      color: colorScheme.mutedForeground,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _SummaryPill(
                      icon: Icons.show_chart_rounded,
                      label: '${l10n.financeNet} $displayedNetText',
                      color: netColor,
                      onTap: collapseBreakdownByDefault
                          ? onToggleBreakdown
                          : null,
                      trailingIcon: collapseBreakdownByDefault
                          ? (showsBreakdown
                                ? Icons.expand_less_rounded
                                : Icons.expand_more_rounded)
                          : null,
                    ),
                    if (!collapseBreakdownByDefault || showsBreakdown) ...[
                      if (incomeText != null)
                        _SummaryPill(
                          icon: Icons.arrow_upward_rounded,
                          label: displayedIncomeText!,
                          color: palette.positive,
                        ),
                      if (expenseText != null)
                        _SummaryPill(
                          icon: Icons.arrow_downward_rounded,
                          label: displayedExpenseText!,
                          color: palette.negative,
                        ),
                    ],
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
              ? ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: group.transactions.length,
                  padding: EdgeInsets.only(
                    top: 14,
                    left: usePanelChrome ? 0 : compactHorizontalPadding,
                    right: usePanelChrome ? 0 : compactHorizontalPadding,
                    bottom: usePanelChrome ? 0 : 6,
                  ),
                  itemBuilder: (context, index) {
                    final transaction = group.transactions[index];
                    return _TransactionTile(
                      transaction: transaction,
                      workspaceCurrency: workspaceCurrency,
                      exchangeRates: exchangeRates,
                      onTap: () => onTransactionTap(transaction),
                      usePanelChrome: usePanelChrome,
                      emphasizeTransactionRows: emphasizeTransactionRows,
                      showAmounts: showAmounts,
                    );
                  },
                  separatorBuilder: (context, index) => SizedBox(
                    height: usePanelChrome ? 10 : 12,
                  ),
                )
              : const SizedBox.shrink(),
        ),
      ],
    );

    if (usePanelChrome) {
      return Padding(
        padding: const EdgeInsets.only(top: 10),
        child: FinancePanel(
          padding: const EdgeInsets.all(16),
          backgroundColor: FinancePalette.of(context).elevatedPanel,
          child: summaryBody,
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.only(top: 14, bottom: 12),
      child: summaryBody,
    );
  }
}

String _maskedAmountText() => '••••••';

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({
    required this.transaction,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.onTap,
    required this.usePanelChrome,
    required this.emphasizeTransactionRows,
    required this.showAmounts,
  });

  final Transaction transaction;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final VoidCallback onTap;
  final bool usePanelChrome;
  final bool emphasizeTransactionRows;
  final bool showAmounts;

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
    final palette = FinancePalette.of(context);
    final colorScheme = theme.colorScheme;
    final amount = transaction.amount ?? 0;
    final isExpense = amount < 0;
    final isTransfer = transaction.isTransfer;
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
    final rawDescription = transaction.description?.trim();
    final hasDescription = rawDescription?.isNotEmpty ?? false;
    final title = isTransfer
        ? context.l10n.financeTransfer
        : (transaction.categoryName ?? rawDescription ?? '—');
    final description = isTransfer
        ? (hasDescription ? rawDescription : null)
        : (hasDescription && rawDescription != title ? rawDescription : null);

    final categoryColor =
        _parseHex(transaction.categoryColor) ??
        (isTransfer
            ? palette.accent
            : (isExpense ? palette.negative : palette.positive));

    final actualAmountText = isExpense
        ? formatCurrency(amount, currency)
        : '+${formatCurrency(amount, currency)}';
    final amountText = showAmounts ? actualAmountText : _maskedAmountText();
    final semanticsLabel = [
      title,
      if (showAmounts) actualAmountText,
    ].where((part) => part.isNotEmpty).join(', ');
    final actualConvertedAmountText = showConvertedAmount
        ? (convertedAmount >= 0
              ? '≈ +${formatCurrency(convertedAmount, workspaceCurrency)}'
              : '≈ ${formatCurrency(convertedAmount, workspaceCurrency)}')
        : null;
    final convertedAmountText = showAmounts ? actualConvertedAmountText : null;
    final transferLinkedAmountText =
        isTransfer &&
            transaction.transfer?.linkedAmount != null &&
            transaction.transfer?.linkedWalletCurrency != null &&
            transaction.transfer!.linkedWalletCurrency!.toUpperCase() !=
                currency.toUpperCase()
        ? (showAmounts
              ? formatCurrency(
                  transaction.transfer!.linkedAmount!,
                  transaction.transfer!.linkedWalletCurrency!,
                )
              : _maskedAmountText())
        : null;

    final categoryIcon = resolveTransactionCategoryIcon(transaction);
    final metaChips = Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        if (!isTransfer && transaction.categoryName != null)
          _Chip(
            label: transaction.categoryName!,
            icon: categoryIcon,
            color: categoryColor,
          ),
        if (!isTransfer && transaction.walletName != null)
          _Chip(
            label: transaction.walletName!,
            leading: WalletVisualAvatar(
              icon: transaction.walletIcon,
              imageSrc: transaction.walletImageSrc,
              fallbackIcon: lucide.LucideIcons.walletCards,
              size: 14,
            ),
          ),
      ],
    );
    final tagsWrap = Wrap(
      spacing: 4,
      runSpacing: 4,
      children: transaction.tags.map((tag) {
        final tagColor =
            _parseHex(tag.color) ?? FinancePalette.of(context).accent;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(
            color: tagColor.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            tag.name,
            style: theme.typography.xSmall.copyWith(
              color: tagColor,
              fontWeight: FontWeight.w600,
            ),
          ),
        );
      }).toList(),
    );
    final transferRoute =
        isTransfer &&
            transaction.walletName != null &&
            transaction.transfer != null
        ? _TransferWalletRoute(
            sourceWalletName: transaction.walletName!,
            sourceWalletIcon: transaction.walletIcon,
            sourceWalletImageSrc: transaction.walletImageSrc,
            destinationWalletName: transaction.transfer!.linkedWalletName,
            accentColor: palette.accent,
          )
        : null;
    final content = emphasizeTransactionRows
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: categoryColor.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(15),
                    ),
                    child: Icon(
                      categoryIcon,
                      size: 18,
                      color: categoryColor,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Align(
                      alignment: Alignment.topRight,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            amountText,
                            maxLines: 1,
                            style: theme.typography.large.copyWith(
                              fontWeight: FontWeight.w900,
                              color: isTransfer
                                  ? palette.accent
                                  : isExpense
                                  ? palette.negative
                                  : palette.positive,
                            ),
                          ),
                          if (transferLinkedAmountText != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              transferLinkedAmountText,
                              style: theme.typography.xSmall.copyWith(
                                color: colorScheme.mutedForeground,
                              ),
                            ),
                          ] else if (convertedAmountText != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              convertedAmountText,
                              style: theme.typography.xSmall.copyWith(
                                color: colorScheme.mutedForeground,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w700,
                  height: 1.3,
                ),
              ),
              if (description != null) ...[
                const SizedBox(height: 4),
                Text(
                  description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.xSmall.copyWith(
                    color: colorScheme.mutedForeground,
                    height: 1.3,
                  ),
                ),
              ],
              if (transferRoute != null) ...[
                const SizedBox(height: 8),
                transferRoute,
              ] else if (transaction.categoryName != null ||
                  transaction.walletName != null) ...[
                const SizedBox(height: 8),
                metaChips,
              ],
              if (transaction.tags.isNotEmpty) ...[
                const SizedBox(height: 8),
                tagsWrap,
              ],
              if (isTransfer || convertedAmountText != null) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 10,
                  runSpacing: 4,
                  children: [
                    if (isTransfer)
                      _MutedInlineInfo(
                        icon: Icons.swap_horiz_rounded,
                        label: context.l10n.financeTransfer,
                      ),
                    if (convertedAmountText != null)
                      _MutedInlineInfo(
                        icon: Icons.currency_exchange_rounded,
                        label: convertedAmountText,
                      ),
                  ],
                ),
              ],
            ],
          )
        : Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: categoryColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  categoryIcon,
                  size: 18,
                  color: categoryColor,
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
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 8),
                    metaChips,
                    if (transaction.tags.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      tagsWrap,
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 118),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerRight,
                      child: Text(
                        amountText,
                        maxLines: 1,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w800,
                          color: isTransfer
                              ? palette.accent
                              : isExpense
                              ? palette.negative
                              : palette.positive,
                        ),
                      ),
                    ),
                    if (isTransfer)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          context.l10n.financeTransfer,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ),
                    if (transferLinkedAmountText != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          transferLinkedAmountText,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ),
                    if (convertedAmountText != null &&
                        transferLinkedAmountText == null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
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
          );

    final tileChild = usePanelChrome
        ? FinancePanel(
            radius: 20,
            onTap: onTap,
            borderColor: categoryColor.withValues(alpha: 0.28),
            padding: const EdgeInsets.all(14),
            child: content,
          )
        : Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: content,
              ),
            ),
          );

    return Semantics(
      button: true,
      onTap: onTap,
      label: semanticsLabel,
      child: tileChild,
    );
  }
}

class _TransferWalletRoute extends StatelessWidget {
  const _TransferWalletRoute({
    required this.sourceWalletName,
    required this.sourceWalletIcon,
    required this.sourceWalletImageSrc,
    required this.destinationWalletName,
    required this.accentColor,
  });

  final String sourceWalletName;
  final String? sourceWalletIcon;
  final String? sourceWalletImageSrc;
  final String destinationWalletName;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _Chip(
          label: sourceWalletName,
          leading: WalletVisualAvatar(
            icon: sourceWalletIcon,
            imageSrc: sourceWalletImageSrc,
            fallbackIcon: lucide.LucideIcons.walletCards,
            size: 14,
          ),
        ),
        Icon(
          Icons.arrow_right_alt_rounded,
          size: 18,
          color: accentColor,
        ),
        _Chip(
          label: destinationWalletName,
          icon: lucide.LucideIcons.repeat2,
          color: accentColor,
        ),
      ],
    );
  }
}

class _SummaryPill extends StatelessWidget {
  const _SummaryPill({
    required this.icon,
    required this.label,
    required this.color,
    this.onTap,
    this.trailingIcon,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;
  final IconData? trailingIcon;

  @override
  Widget build(BuildContext context) {
    final body = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: shad.Theme.of(context).typography.xSmall.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (trailingIcon != null) ...[
            const SizedBox(width: 4),
            Icon(trailingIcon, size: 14, color: color),
          ],
        ],
      ),
    );

    if (onTap == null) {
      return body;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: body,
      ),
    );
  }
}

class _MutedInlineInfo extends StatelessWidget {
  const _MutedInlineInfo({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: theme.colorScheme.mutedForeground),
        const SizedBox(width: 4),
        Text(
          label,
          style: theme.typography.xSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      ],
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
    final availableWidth = MediaQuery.sizeOf(context).width - 88;
    final maxWidth = availableWidth > 180 ? availableWidth : 180.0;

    return Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
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
