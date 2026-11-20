import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// Tone of a checkpoint variance: a shortfall (actual below the ledger) is
/// destructive, a surplus is a warning because it is still unexplained, and
/// a balanced wallet is a success.
AppTone checkpointVarianceTone(double variance) {
  if (variance < 0) return AppTone.destructive;
  if (variance > 0) return AppTone.warning;
  return AppTone.success;
}

class CheckpointAmounts extends StatelessWidget {
  const CheckpointAmounts({
    required this.actual,
    required this.ledger,
    required this.variance,
    required this.currency,
    this.isInterval = false,
    super.key,
  });

  final double actual;
  final double ledger;
  final double variance;
  final String currency;
  final bool isInterval;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.tokens.colorScheme;
    return AppGroupedCard(
      children: [
        AppRichRow(
          title: isInterval
              ? l10n.financeCheckpointsActualDelta
              : l10n.financeCheckpointsActualBalance,
          trailing: FinanceAmountText(actual, currency),
        ),
        AppRichRow(
          title: isInterval
              ? l10n.financeCheckpointsLedgerDelta
              : l10n.financeCheckpointsLedgerBalance,
          trailing: FinanceAmountText(ledger, currency),
        ),
        AppRichRow(
          title: l10n.financeCheckpointsVariance,
          trailing: FinanceAmountText(
            variance,
            currency,
            signed: true,
            color: financeAmountsVisible(context)
                ? checkpointVarianceTone(variance).foreground(colors)
                : null,
          ),
        ),
      ],
    );
  }
}
