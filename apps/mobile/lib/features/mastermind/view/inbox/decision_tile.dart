import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
import 'package:mobile/l10n/l10n.dart';

/// One journal decision in the Decisions list: title, category, risk as a word
/// plus shape, product and relative time. Tapping opens the detail.
class DecisionTile extends StatelessWidget {
  const DecisionTile({required this.decision, super.key});

  final JournalDecision decision;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedRow(
      title: Text(decision.title),
      showChevron: true,
      // Pushed, so Back returns to this list with its segment and chips intact.
      onTap: () =>
          context.push(Routes.mastermindInboxDecisionPath(decision.id)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MastermindTimeLabel(decision.at),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              MastermindStatusChip(
                label: MastermindLabels.decisionCategory(
                  l10n,
                  decision.category,
                ),
              ),
              RiskBadge(risk: decision.risk),
              if (decision.product case final product?)
                MastermindStatusChip(label: MastermindLabels.product(product)),
            ],
          ),
        ],
      ),
    );
  }
}

/// "Risk: low" with a signal glyph, so the level is never colour alone.
class RiskBadge extends StatelessWidget {
  const RiskBadge({required this.risk, super.key});

  final Risk risk;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return MastermindStatusChip(
      icon: switch (risk) {
        Risk.low => LucideIcons.signalLow,
        Risk.med => LucideIcons.signalMedium,
        Risk.high => LucideIcons.signalHigh,
      },
      label: l10n.mastermindRiskLine(MastermindLabels.risk(l10n, risk)),
    );
  }
}
