import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_alerts_panel.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_digest.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_line.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_machines_panel.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_recovered_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_release_strip.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_today_outcomes_panel.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_entry.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind`, Today: what is happening now, the figures that need the
/// owner, the release train, what needs the owner and every machine.
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
            const FleetAccessTodayAction(),
            FleetFreshnessLine(state: state, now: now),
            FleetClock(
              period: const Duration(seconds: 30),
              now: now,
              builder: (context, current) => Column(
                children: [
                  FleetHealthHero(snapshot: snapshot, now: current),
                  const SizedBox(height: AppSpacing.lg),
                  _Kpis(snapshot: snapshot, now: current),
                  if (snapshot.counts.resolved > 0) ...[
                    const SizedBox(height: AppSpacing.lg),
                    FleetRecoveredCard(counts: snapshot.counts),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            if (snapshot.release case final release?) ...[
              FleetReleaseStrip(release: release),
              const SizedBox(height: AppSpacing.lg),
            ],
            if (snapshot.alerts.isNotEmpty) ...[
              FleetAlertsPanel(alerts: snapshot.alerts, now: now),
              const SizedBox(height: AppSpacing.lg),
            ],
            _NeedsYouPanel(snapshot: snapshot, state: state, now: now),
            const SizedBox(height: AppSpacing.lg),
            FleetClock(
              period: const Duration(seconds: 10),
              now: now,
              builder: (context, current) => Column(
                children: [
                  FleetTodayOutcomesPanel(snapshot: snapshot, now: current),
                  const SizedBox(height: AppSpacing.lg),
                  FleetMachinesPanel(snapshot: snapshot, now: () => current),
                ],
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

class FleetHealthHero extends StatelessWidget {
  const FleetHealthHero({required this.snapshot, required this.now, super.key});

  final FleetSnapshot snapshot;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final counts = snapshot.counts;
    final open = snapshot.needsYouAt(now).length;
    final paging = snapshot.pageAlerts.length;
    // Failed counts only terminal failures nobody picked up again; recovered
    // and cancelled lanes have their own card.
    final (headline, tone, icon) = paging > 0
        ? (
            l10n.mastermindFleetHeadlinePaging(paging),
            AppTone.destructive,
            LucideIcons.flame,
          )
        : counts.running == 0 && counts.failed == 0
        ? (
            l10n.mastermindFleetHeadlineQuiet,
            open > 0 ? AppTone.warning : AppTone.neutral,
            open > 0 ? LucideIcons.inbox : LucideIcons.moon,
          )
        : (
            l10n.mastermindFleetHeadlineRunningFailed(
              counts.running,
              counts.failed,
            ),
            counts.failed > 0
                ? AppTone.destructive
                : open > 0
                ? AppTone.warning
                : AppTone.success,
            counts.failed > 0 ? LucideIcons.circleAlert : LucideIcons.activity,
          );
    final online = snapshot.machines
        .where(
          (machine) =>
              fleetMachineStatusAt(machine, now) == FleetMachineStatus.online,
        )
        .length;
    return AppSummaryHero(
      eyebrow: l10n.mastermindFleetNowEyebrow,
      headline: headline,
      supporting: fleetDigest(l10n, snapshot, now),
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

/// Running lanes, what needs the owner, logins blocking work and failed
/// lanes; each opens the list behind it.
class _Kpis extends StatelessWidget {
  const _Kpis({required this.snapshot, required this.now});

  final FleetSnapshot snapshot;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final counts = snapshot.counts;
    final needs = snapshot.needsYouCountAt(now);
    final decisions = snapshot.needsYouAt(now).length;
    final logins = fleetOpenLogins(snapshot, now);
    AppTone alarm(int value, AppTone tone) =>
        value == 0 ? AppTone.neutral : tone;
    return AppAdaptiveGrid(
      minTileWidth: 140,
      equalHeight: true,
      children: [
        AppStatTile(
          label: l10n.mastermindFleetKpiRunning,
          value: '${counts.running}',
          icon: FleetLaneState.running.icon,
          tone: alarm(counts.running, AppTone.success),
          onTap: () => context.go(
            '${Routes.mastermindWork}?state=${FleetLaneState.running.name}',
          ),
        ),
        AppStatTile(
          label: l10n.mastermindFleetKpiNeedsYou,
          value: '$needs',
          icon: LucideIcons.inbox,
          // A paging burn is urgent even before any decision is open.
          tone: snapshot.pageAlerts.isNotEmpty
              ? AppTone.destructive
              : alarm(needs, AppTone.warning),
          // Page alerts are listed on Today itself; Inbox holds decisions.
          onTap: decisions == 0 && needs > 0
              ? null
              : () => context.go(Routes.mastermindInbox),
        ),
        AppStatTile(
          label: l10n.mastermindFleetKpiLogins,
          value: '$logins',
          icon: LucideIcons.keyRound,
          tone: alarm(logins, AppTone.warning),
          onTap: () => context.go(Routes.mastermindInbox),
        ),
        AppStatTile(
          label: l10n.mastermindFleetKpiFailed,
          value: '${counts.failed}',
          icon: FleetLaneState.failed.icon,
          tone: alarm(counts.failed, AppTone.destructive),
          onTap: () => context.go(
            '${Routes.mastermindWork}?state=${FleetLaneState.failed.name}',
          ),
        ),
      ],
    );
  }
}

class _NeedsYouPanel extends StatelessWidget {
  const _NeedsYouPanel({required this.snapshot, required this.state, this.now});

  final FleetSnapshot snapshot;
  final FleetViewState state;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final open = snapshot.needsYouAt((now ?? DateTime.now)().toUtc());
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
