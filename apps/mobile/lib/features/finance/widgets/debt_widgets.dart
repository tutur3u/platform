import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/debt_loan.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

String debtTypeLabel(BuildContext context, DebtLoanType type) => switch (type) {
  DebtLoanType.debt => context.l10n.financeDebtTypeDebt,
  DebtLoanType.loan => context.l10n.financeDebtTypeLoan,
};

String debtStatusLabel(BuildContext context, DebtLoanStatus? status) =>
    switch (status) {
      null => context.l10n.financeDebtStatusAll,
      DebtLoanStatus.active => context.l10n.financeDebtStatusActive,
      DebtLoanStatus.paid => context.l10n.financeDebtStatusPaid,
      DebtLoanStatus.defaulted => context.l10n.financeDebtStatusDefaulted,
      DebtLoanStatus.cancelled => context.l10n.financeDebtStatusCancelled,
    };

/// Debts are money going out and loans money coming back, so they take the
/// expense and income tones while active.
AppTone debtTone(DebtLoan debt) => switch (debt.status) {
  DebtLoanStatus.active =>
    debt.type == DebtLoanType.debt ? AppTone.destructive : AppTone.success,
  DebtLoanStatus.paid => AppTone.neutral,
  DebtLoanStatus.defaulted => AppTone.warning,
  DebtLoanStatus.cancelled => AppTone.neutral,
};

IconData debtIcon(DebtLoanType type) => switch (type) {
  DebtLoanType.debt => LucideIcons.arrowUpRight,
  DebtLoanType.loan => LucideIcons.arrowDownLeft,
};

/// Net position with what the workspace owes and is owed.
class DebtSummaryHero extends StatelessWidget {
  const DebtSummaryHero({
    required this.summary,
    required this.currency,
    super.key,
  });

  final DebtLoanSummary summary;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final net = summary.netPosition;
    return AppSummaryHero(
      key: const ValueKey('debt-summary'),
      eyebrow: l10n.financeDebtsNetPosition,
      headline: financeMoney(context, net, currency, signed: true),
      icon: LucideIcons.handCoins,
      tone: net < 0
          ? AppTone.destructive
          : net > 0
          ? AppTone.success
          : AppTone.primary,
      facts: [
        AppHeroFact(
          label: '${l10n.financeDebtsYouOwe} (${summary.activeDebtCount})',
          value: financeMoney(context, summary.totalDebtRemaining, currency),
        ),
        AppHeroFact(
          label: '${l10n.financeDebtsOwedToYou} (${summary.activeLoanCount})',
          value: financeMoney(context, summary.totalLoanRemaining, currency),
        ),
      ],
    );
  }
}

/// Status chooser and type pills with counts. Mount at the page's full
/// width so the strip clips only at the screen edge.
class DebtFilters extends StatelessWidget {
  const DebtFilters({
    required this.debts,
    required this.type,
    required this.status,
    required this.onTypeChanged,
    required this.onStatusChanged,
    super.key,
  });

  final List<DebtLoan> debts;
  final DebtLoanType? type;
  final DebtLoanStatus? status;
  final ValueChanged<DebtLoanType?> onTypeChanged;
  final ValueChanged<DebtLoanStatus?> onStatusChanged;

  Future<void> _pickStatus(BuildContext context) async {
    const all = 'all';
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: context.l10n.financeDebtStatus,
      selected: status?.name ?? all,
      choices: [
        for (final value in [null, ...DebtLoanStatus.values])
          AppSheetChoice(
            value: value?.name ?? all,
            label: debtStatusLabel(context, value),
          ),
      ],
    );
    if (picked == null) return;
    final next = picked == all ? null : DebtLoanStatus.values.byName(picked);
    if (next != status) onStatusChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    int count(DebtLoanType? type) => debts
        .where(
          (debt) =>
              (type == null || debt.type == type) &&
              (status == null || debt.status == status),
        )
        .length;
    return LayoutBuilder(
      builder: (context, constraints) {
        final insets = AppPageInsets.of(context, width: constraints.maxWidth);
        return AppFilterBar<DebtLoanType?>(
          key: const ValueKey('debt-filters'),
          scrollPadding: EdgeInsets.only(
            left: insets.left,
            right: insets.right,
          ),
          leading: AppFilterButton(
            key: const ValueKey('debt-status'),
            icon: LucideIcons.listFilter,
            label: debtStatusLabel(context, status),
            active: status != DebtLoanStatus.active,
            menu: true,
            onPressed: () => unawaited(_pickStatus(context)),
          ),
          options: [
            AppFilterOption(
              value: null,
              label: l10n.financeAll,
              count: count(null),
            ),
            AppFilterOption(
              value: DebtLoanType.debt,
              label: l10n.financeDebtTypesDebt,
              count: count(DebtLoanType.debt),
            ),
            AppFilterOption(
              value: DebtLoanType.loan,
              label: l10n.financeDebtTypesLoan,
              count: count(DebtLoanType.loan),
            ),
          ],
          selected: type,
          onSelected: onTypeChanged,
        );
      },
    );
  }
}

/// One debt or loan: counterparty, due date (overdue in the destructive
/// tone), repayment progress and the remaining balance.
class DebtRow extends StatelessWidget {
  const DebtRow({
    required this.debt,
    required this.now,
    required this.onTap,
    super.key,
  });

  final DebtLoan debt;
  final DateTime now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.tokens.colorScheme;
    final dates = MaterialLocalizations.of(context);
    final due = debt.dueDate;
    final overdue = debt.isOverdue(now);
    return AppRichRow(
      title: debt.name,
      subtitle: debt.counterparty,
      leading: AppIconTile(icon: debtIcon(debt.type), tone: debtTone(debt)),
      meta: [
        if (due != null)
          AppMetaItem(
            icon: LucideIcons.calendarClock,
            label: overdue
                ? l10n.financeDebtOverdue
                : l10n.financeDebtDueOn(dates.formatMediumDate(due)),
            color: overdue ? colors.destructive : null,
          ),
        AppMetaItem(
          icon: LucideIcons.chartNoAxesColumnIncreasing,
          label: l10n.financeDebtRepaid(
            debt.progressPercentage.clamp(0, 100).round().toString(),
          ),
        ),
      ],
      trailing: FinanceAmountText(debt.remainingBalance, debt.currency),
      trailingCaption: debt.status == DebtLoanStatus.active
          ? null
          : debtStatusLabel(context, debt.status),
      onTap: onTap,
    );
  }
}
