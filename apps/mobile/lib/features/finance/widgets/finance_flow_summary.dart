import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_card.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_tone.dart';
import 'package:mobile/l10n/l10n.dart';

/// Narrowest column, per unit of text scale, that keeps a figure's label on
/// one readable line. Narrower cards stack the figures as rows.
const financeFlowColumnMinWidth = 80.0;

/// Income, expense and net of a period in one card, with an optional
/// [chart] underneath. Labels stay on one line (ellipsised, never broken
/// inside a word) and amounts scale down instead of clipping; when three
/// columns would be too narrow for the text scale, the figures stack.
class FinanceFlowSummary extends StatelessWidget {
  const FinanceFlowSummary({
    required this.income,
    required this.expense,
    required this.currency,
    this.chart,
    super.key,
  });

  final double income;

  /// Money out as a negative (or zero) amount.
  final double expense;
  final String currency;
  final Widget? chart;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final scale = MediaQuery.textScalerOf(context).scale(1);
    final net = income + expense;
    final figures = [
      _Figure(
        key: const ValueKey('finance-flow-income'),
        label: l10n.financeIncome,
        amount: income,
        tone: FinanceTone.income,
      ),
      _Figure(
        key: const ValueKey('finance-flow-expense'),
        label: l10n.financeExpense,
        amount: expense,
        tone: FinanceTone.expense,
      ),
      _Figure(
        key: const ValueKey('finance-flow-net'),
        label: l10n.financeNet,
        amount: net,
        tone: net >= 0 ? FinanceTone.income : FinanceTone.expense,
        emphasised: true,
      ),
    ];
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final columns =
                  constraints.maxWidth / 3 >= financeFlowColumnMinWidth * scale;
              if (!columns) {
                return Column(
                  spacing: AppSpacing.sm,
                  children: [
                    for (final figure in figures)
                      _FigureLine(figure: figure, currency: currency),
                  ],
                );
              }
              return Row(
                spacing: AppSpacing.md,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final figure in figures)
                    Expanded(
                      child: _FigureColumn(figure: figure, currency: currency),
                    ),
                ],
              );
            },
          ),
          if (chart case final chart?) ...[
            const SizedBox(height: AppSpacing.lg),
            chart,
          ],
        ],
      ),
    );
  }
}

class _Figure {
  const _Figure({
    required this.key,
    required this.label,
    required this.amount,
    required this.tone,
    this.emphasised = false,
  });

  final Key key;
  final String label;
  final double amount;
  final FinanceTone tone;
  final bool emphasised;
}

class _FigureLabel extends StatelessWidget {
  const _FigureLabel({required this.figure});

  final _Figure figure;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Row(
      spacing: AppSpacing.xs,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: figure.tone.colors(context).ink,
            shape: BoxShape.circle,
          ),
        ),
        Flexible(
          child: Text(
            figure.label,
            maxLines: 1,
            softWrap: false,
            overflow: TextOverflow.ellipsis,
            style: tokens.typography.caption.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
        ),
      ],
    );
  }
}

class _FigureAmount extends StatelessWidget {
  const _FigureAmount({
    required this.figure,
    required this.currency,
    this.alignment = AlignmentDirectional.centerStart,
  });

  final _Figure figure;
  final String currency;
  final AlignmentGeometry alignment;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final positive = figure.amount > 0;
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: alignment,
      child: FinanceAmountText(
        figure.amount,
        currency,
        signed: true,
        color: positive && figure.tone == FinanceTone.income
            ? colors.success
            : colors.foreground,
        style: tokens.typography.numeric.copyWith(
          fontSize: figure.emphasised ? 17 : 15,
          height: 22 / 15,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _FigureColumn extends StatelessWidget {
  const _FigureColumn({required this.figure, required this.currency});

  final _Figure figure;
  final String currency;

  @override
  Widget build(BuildContext context) => Column(
    key: figure.key,
    crossAxisAlignment: CrossAxisAlignment.start,
    spacing: AppSpacing.xs,
    children: [
      _FigureLabel(figure: figure),
      _FigureAmount(figure: figure, currency: currency),
    ],
  );
}

class _FigureLine extends StatelessWidget {
  const _FigureLine({required this.figure, required this.currency});

  final _Figure figure;
  final String currency;

  @override
  Widget build(BuildContext context) => Row(
    key: figure.key,
    spacing: AppSpacing.md,
    children: [
      Flexible(child: _FigureLabel(figure: figure)),
      Expanded(
        child: _FigureAmount(
          figure: figure,
          currency: currency,
          alignment: AlignmentDirectional.centerEnd,
        ),
      ),
    ],
  );
}
