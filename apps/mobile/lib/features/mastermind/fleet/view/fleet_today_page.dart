import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_line.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_machines_panel.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind`, Today: fleet health at a glance, what needs the owner, lane
/// counts that open Work filtered, and every machine.
class FleetTodayPage extends StatelessWidget {
  const FleetTodayPage({this.now, super.key});

  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) => FleetSection(
    builder: (context, snapshot, state) => AppPageScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverList.list(
          children: [
            FleetFreshnessLine(state: state, now: now),
            FleetHealthHero(snapshot: snapshot),
            const SizedBox(height: AppSpacing.lg),
            _LaneCounts(counts: snapshot.counts),
            const SizedBox(height: AppSpacing.lg),
            _NeedsYouPanel(snapshot: snapshot, state: state),
            const SizedBox(height: AppSpacing.lg),
            FleetMachinesPanel(snapshot: snapshot, now: now),
          ],
        ),
      ],
    ),
  );
}

class FleetHealthHero extends StatelessWidget {
  const FleetHealthHero({required this.snapshot, super.key});

  final FleetSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final counts = snapshot.counts;
    final open = snapshot.openDecisions.length;
    final (headline, tone, icon) = open > 0
        ? (
            l10n.mastermindFleetHeadlineNeedsYou(open),
            AppTone.warning,
            LucideIcons.inbox,
          )
        : counts.failed > 0
        ? (
            l10n.mastermindFleetHeadlineFailed(counts.failed),
            AppTone.destructive,
            LucideIcons.circleAlert,
          )
        : counts.running > 0
        ? (
            l10n.mastermindFleetHeadlineRunning(counts.running),
            AppTone.success,
            LucideIcons.activity,
          )
        : (
            l10n.mastermindFleetHeadlineQuiet,
            AppTone.neutral,
            LucideIcons.moon,
          );
    final online = snapshot.machines
        .where((m) => m.status == FleetMachineStatus.online)
        .length;
    return AppSummaryHero(
      eyebrow: l10n.mastermindFleetHealthEyebrow,
      headline: headline,
      icon: icon,
      tone: tone,
      facts: [
        AppHeroFact(
          label: snapshot.orchestratorLabel,
          value: snapshot.orchestratorState.label(l10n),
        ),
        AppHeroFact(
          label: l10n.mastermindFleetMachinesOnline,
          value: l10n.mastermindFleetMachinesValue(
            '$online',
            '${snapshot.machines.length}',
          ),
        ),
      ],
    );
  }
}

class _LaneCounts extends StatelessWidget {
  const _LaneCounts({required this.counts});

  final FleetCounts counts;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppAdaptiveGrid(
      minTileWidth: 140,
      equalHeight: true,
      children: [
        for (final state in const [
          FleetLaneState.running,
          FleetLaneState.waiting,
          FleetLaneState.queued,
          FleetLaneState.failed,
          FleetLaneState.idle,
        ])
          AppStatTile(
            label: state.label(l10n),
            value: '${counts.of(state)}',
            icon: state.icon,
            // A zero keeps a neutral glyph: only real failures alarm.
            tone: counts.of(state) == 0 ? AppTone.neutral : state.tone,
            onTap: () =>
                context.go('${Routes.mastermindWork}?state=${state.name}'),
          ),
      ],
    );
  }
}

class _NeedsYouPanel extends StatelessWidget {
  const _NeedsYouPanel({required this.snapshot, required this.state});

  final FleetSnapshot snapshot;
  final FleetViewState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final open = snapshot.openDecisions;
    return AppPanel(
      title: l10n.mastermindFleetNeedsYouTitle,
      actionLabel: open.length > 3 ? l10n.mastermindFleetSeeAll : null,
      onAction: open.length > 3
          ? () => context.go(Routes.mastermindInbox)
          : null,
      padded: open.isEmpty,
      child: open.isEmpty
          ? AppStateMessage.inline(
              icon: LucideIcons.circleCheck,
              title: l10n.mastermindFleetInboxEmpty,
              tone: AppTone.success,
            )
          : Column(
              children: [
                for (final decision in open.take(3))
                  AppRichRow(
                    title: decision.title,
                    subtitle: decision.recommended == null
                        ? null
                        : '${l10n.mastermindFleetRecommended}: '
                              '${decision.recommended!.label}',
                    leading: AppIconTile(
                      icon: LucideIcons.messageSquare,
                      tone: decision.urgency == FleetUrgency.urgent
                          ? AppTone.destructive
                          : AppTone.warning,
                    ),
                    onTap: () => context.go(Routes.mastermindInbox),
                  ),
              ],
            ),
    );
  }
}
