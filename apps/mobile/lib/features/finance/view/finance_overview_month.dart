import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_card.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_section_header.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/finance/utils/finance_flow.dart';
import 'package:mobile/features/finance/widgets/finance_hue.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/l10n/l10n.dart';

/// This month's income and expense in the workspace currency, as two
/// tiles under the month name. Shows placeholders until [flow] loads.
class FinanceMonthSummary extends StatelessWidget {
  const FinanceMonthSummary({
    required this.flow,
    required this.month,
    this.loading = false,
    super.key,
  });

  final FinanceFlow? flow;
  final DateTime month;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final flow = this.flow;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(
          title: DateFormat.MMMM(locale).format(month),
          subtitle: l10n.financeThisMonth,
        ),
        if (flow == null)
          if (loading)
            const FinanceSkeleton(height: 92)
          else
            AppStateMessage(
              icon: Icons.info_outline,
              title: l10n.financeMonthUnavailable,
            )
        else
          IntrinsicHeight(
            child: Row(
              spacing: 10,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: FinanceFlowTile(
                    key: const ValueKey('finance-month-income'),
                    label: l10n.financeIncome,
                    icon: LucideIcons.arrowDownLeft,
                    hue: 'green',
                    amount: flow.income,
                    currency: flow.currency,
                    approximate: flow.approximate,
                  ),
                ),
                Expanded(
                  child: FinanceFlowTile(
                    key: const ValueKey('finance-month-expense'),
                    label: l10n.financeExpense,
                    icon: LucideIcons.arrowUpRight,
                    hue: 'red',
                    amount: flow.expense,
                    currency: flow.currency,
                    approximate: flow.approximate,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// One money-in or money-out figure: a hue icon tile, a label and the
/// signed, masked amount.
class FinanceFlowTile extends StatelessWidget {
  const FinanceFlowTile({
    required this.label,
    required this.icon,
    required this.hue,
    required this.amount,
    required this.currency,
    this.approximate = false,
    super.key,
  });

  final String label;
  final IconData icon;
  final String hue;
  final double amount;
  final String currency;
  final bool approximate;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            spacing: 8,
            children: [
              FinanceHueTile(icon: icon, hue: hue, size: 28),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.typography.uiSm.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: FinanceAmountText(
              amount,
              currency,
              signed: true,
              approximate: approximate,
              color: amount > 0 ? colors.success : null,
              style: tokens.typography.numeric.copyWith(
                fontSize: 18,
                height: 24 / 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
