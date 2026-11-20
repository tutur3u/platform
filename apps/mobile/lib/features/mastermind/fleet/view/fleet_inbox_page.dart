import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_decision_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_line.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox`: every decision waiting on the owner, most urgent
/// first, then the ones already answered with their pickup status.
class FleetInboxPage extends StatelessWidget {
  const FleetInboxPage({this.now, super.key});

  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) => FleetSection(
    builder: (context, snapshot, state) {
      final fleet = context.read<MastermindRuntime>().fleet;
      final open = snapshot.openDecisions;
      final answered = snapshot.decisions
          .where((d) => snapshot.answers.containsKey(d.id))
          .toList();
      Widget card(FleetDecision decision) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: FleetDecisionCard(
          key: ValueKey('fleet-decision-${decision.id}'),
          decision: decision,
          orchestrator: snapshot.orchestratorLabel,
          receipt: snapshot.answers[decision.id],
          pending: state.pending[decision.id],
          now: now,
          onAnswer: (action, {optionId, text}) => unawaited(
            fleet.answer(decision.id, action, optionId: optionId, text: text),
          ),
          onRetry: () => unawaited(fleet.retry(decision.id)),
        ),
      );
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverList.list(
            children: [
              FleetFreshnessLine(state: state, now: now),
              AppSectionHeader(
                title: context.l10n.mastermindFleetNeedsYouTitle,
                count: open.length,
              ),
              if (open.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                  child: AppStateMessage.inline(
                    icon: LucideIcons.circleCheck,
                    title: context.l10n.mastermindFleetInboxEmpty,
                    tone: AppTone.success,
                  ),
                ),
              ...open.map(card),
              if (answered.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.md),
                AppSectionHeader(
                  title: context.l10n.mastermindFleetAnsweredTitle,
                  count: answered.length,
                ),
                ...answered.map(card),
              ],
            ],
          ),
        ],
      );
    },
  );
}
