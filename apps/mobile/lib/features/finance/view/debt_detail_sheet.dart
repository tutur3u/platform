import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/debt_loan.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/widgets/debt_widgets.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// What the person chose in [DebtDetailSheet].
sealed class DebtDetailAction {
  const DebtDetailAction();
}

class DebtEdit extends DebtDetailAction {
  const DebtEdit();
}

class DebtDelete extends DebtDetailAction {
  const DebtDelete();
}

class DebtSetStatus extends DebtDetailAction {
  const DebtSetStatus(this.status);

  final DebtLoanStatus status;
}

Future<DebtDetailAction?> showDebtDetailSheet(
  BuildContext context, {
  required DebtLoan debt,
  required DateTime now,
  required bool canManage,
  Wallet? wallet,
}) => showAppSheet<DebtDetailAction>(
  context: context,
  builder: (_) => DebtDetailSheet(
    debt: debt,
    now: now,
    wallet: wallet,
    canManage: canManage,
  ),
);

/// Repayment overview, terms and, for finance managers, status, edit and
/// delete actions.
class DebtDetailSheet extends StatelessWidget {
  const DebtDetailSheet({
    required this.debt,
    required this.now,
    required this.canManage,
    this.wallet,
    super.key,
  });

  final DebtLoan debt;
  final DateTime now;
  final bool canManage;
  final Wallet? wallet;

  Future<void> _changeStatus(BuildContext context) async {
    final picked = await showAppChoiceSheet<DebtLoanStatus>(
      context: context,
      title: context.l10n.financeDebtStatus,
      selected: debt.status,
      choices: [
        for (final status in DebtLoanStatus.values)
          AppSheetChoice(
            value: status,
            label: debtStatusLabel(context, status),
          ),
      ],
    );
    if (!context.mounted || picked == null || picked == debt.status) return;
    Navigator.of(context).pop(DebtSetStatus(picked));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.tokens.colorScheme;
    final dates = MaterialLocalizations.of(context);
    final tone = debtTone(debt);
    final progress = (debt.progressPercentage / 100).clamp(0.0, 1.0);
    final overdue = debt.isOverdue(now);
    final due = debt.dueDate;
    final rate = debt.interestRate;
    String money(double value) => financeMoney(context, value, debt.currency);
    return AppSheetScaffold(
      title: debt.name,
      description: debt.counterparty,
      icon: debtIcon(debt.type),
      actions: [
        if (canManage) ...[
          if (debt.status == DebtLoanStatus.active)
            AppButton.primary(
              key: const ValueKey('debt-mark-paid'),
              leading: const Icon(LucideIcons.circleCheck),
              onPressed: () => Navigator.of(
                context,
              ).pop(const DebtSetStatus(DebtLoanStatus.paid)),
              child: Text(l10n.financeDebtMarkPaid),
            ),
          AppButton.outline(
            key: const ValueKey('debt-edit'),
            leading: const Icon(LucideIcons.pencil),
            onPressed: () => Navigator.of(context).pop(const DebtEdit()),
            child: Text(l10n.commonEdit),
          ),
        ],
      ],
      headerActions: [
        if (canManage)
          AppIconButton(
            key: const ValueKey('debt-status-action'),
            icon: const Icon(LucideIcons.flag),
            tooltip: l10n.financeDebtStatus,
            onPressed: () => _changeStatus(context),
          ),
        if (canManage)
          AppIconButton(
            key: const ValueKey('debt-delete'),
            icon: const Icon(LucideIcons.trash2),
            tooltip: l10n.commonDelete,
            onPressed: () => Navigator.of(context).pop(const DebtDelete()),
          ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppLayout.itemGap,
        children: [
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            children: [
              AppBadge(child: Text(debtTypeLabel(context, debt.type))),
              AppBadge(
                variant: switch (debt.status) {
                  DebtLoanStatus.active => AppBadgeVariant.primary,
                  DebtLoanStatus.paid => AppBadgeVariant.success,
                  DebtLoanStatus.defaulted => AppBadgeVariant.warning,
                  DebtLoanStatus.cancelled => AppBadgeVariant.secondary,
                },
                child: Text(debtStatusLabel(context, debt.status)),
              ),
              if (overdue)
                AppBadge(
                  variant: AppBadgeVariant.destructive,
                  child: Text(l10n.financeDebtOverdue),
                ),
            ],
          ),
          AppGroupedCard(
            children: [
              Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: AppSpacing.sm,
                  children: [
                    Text(
                      l10n.financeDebtRemaining,
                      style: context.tokens.typography.small.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    FinanceAmountText(
                      debt.remainingBalance,
                      debt.currency,
                      color: financeAmountsVisible(context)
                          ? tone.foreground(colors)
                          : null,
                    ),
                    AppMeter(
                      value: progress,
                      tone: tone == AppTone.neutral ? AppTone.success : tone,
                      semanticLabel: l10n.financeDebtRepaid(
                        (progress * 100).round().toString(),
                      ),
                    ),
                    Text(
                      l10n.financeDebtRepaid(
                        (progress * 100).round().toString(),
                      ),
                      style: context.tokens.typography.xSmall.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    AppKeyValueRow(
                      label: l10n.financeDebtPrincipal,
                      value: money(debt.principalAmount),
                    ),
                    AppKeyValueRow(
                      label: l10n.financeDebtAmountPaid,
                      value: money(debt.totalPaid),
                    ),
                    if (debt.totalInterestPaid > 0)
                      AppKeyValueRow(
                        label: l10n.financeDebtInterestPaid,
                        value: money(debt.totalInterestPaid),
                      ),
                  ],
                ),
              ),
            ],
          ),
          AppGroupedCard(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AppKeyValueRow(
                      label: l10n.financeStartDate,
                      value: dates.formatMediumDate(debt.startDate),
                    ),
                    AppKeyValueRow(
                      label: l10n.financeDebtDueDate,
                      value: due == null
                          ? l10n.financeDebtNoDueDate
                          : dates.formatMediumDate(due),
                    ),
                    if (rate != null && rate > 0)
                      AppKeyValueRow(
                        label: l10n.financeDebtInterestRate,
                        value: l10n.financeDebtInterestValue(
                          rate.toString(),
                          debt.interestType == DebtInterestType.compound
                              ? l10n.financeDebtInterestCompound
                              : l10n.financeDebtInterestSimple,
                        ),
                      ),
                    AppKeyValueRow(
                      label: l10n.financeWallet,
                      value: wallet?.name ?? l10n.financeDebtNoWallet,
                    ),
                    if (debt.description case final description?
                        when description.trim().isNotEmpty)
                      AppKeyValueRow(
                        label: l10n.financeDescription,
                        value: description,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
