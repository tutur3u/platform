import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_alerts_panel.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_groups.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_rows.dart';
import 'package:mobile/l10n/l10n.dart';

/// The two Inbox lanes.
enum FleetInboxLane { needsYou, fyi }

typedef FleetInboxCardBuilder =
    Widget Function(FleetDecision decision, {bool snoozable});

/// Needs you: every open ask, sign-in request and review in one list, most
/// urgent first, then what is snoozed on this device.
List<Widget> fleetNeedsYouLane(
  AppLocalizations l10n,
  FleetInboxGroups groups, {
  required FleetInboxCardBuilder card,
  required void Function(String decisionId) onWake,
}) => [
  if (groups.needs.isEmpty)
    Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: AppStateMessage.inline(
        icon: LucideIcons.circleCheck,
        title: l10n.mastermindFleetInboxEmpty,
        tone: AppTone.success,
      ),
    ),
  for (final decision in groups.needs) card(decision),
  if (groups.snoozed.isNotEmpty) ...[
    AppSectionHeader(
      title: l10n.mastermindFleetSnoozedTitle,
      count: groups.snoozed.length,
    ),
    for (final (decision, until) in groups.snoozed)
      FleetSnoozedRow(
        key: ValueKey('fleet-snoozed-${decision.id}'),
        decision: decision,
        until: until,
        onWake: () => onWake(decision.id),
      ),
    const SizedBox(height: AppSpacing.md),
  ],
];

/// FYI: what only informs (SLO alerts and FYI items), answers that did not
/// arrive, answers with how far they got, and decisions closed on any
/// channel.
List<Widget> fleetFyiLane(
  AppLocalizations l10n,
  FleetSnapshot snapshot,
  FleetInboxGroups groups, {
  required FleetInboxCardBuilder card,
  required List<Widget> undelivered,
  required DateTime now,
  DateTime Function()? clock,
}) => [
  if (groups.fyiCount == 0 && snapshot.alerts.isEmpty)
    Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: AppStateMessage.inline(
        icon: LucideIcons.circleCheck,
        title: l10n.mastermindFleetInboxEmpty,
      ),
    ),
  if (snapshot.alerts.isNotEmpty) ...[
    FleetAlertsPanel(alerts: snapshot.alerts, now: clock),
    const SizedBox(height: AppSpacing.md),
  ],
  if (groups.fyi.isNotEmpty) ...[
    AppSectionHeader(
      title: l10n.mastermindFleetUpdatesTitle,
      count: groups.fyi.length,
    ),
    for (final decision in groups.fyi) card(decision),
  ],
  ...undelivered,
  if (groups.answered.isNotEmpty || groups.resolved.isNotEmpty) ...[
    AppSectionHeader(
      title: l10n.mastermindFleetAnsweredTitle,
      count: groups.answered.length + groups.resolved.length,
    ),
    for (final decision in groups.answered) card(decision, snoozable: false),
    for (final resolved in groups.resolved)
      FleetResolvedRow(
        key: ValueKey('fleet-resolved-${resolved.id}'),
        resolved: resolved,
        now: now,
      ),
  ],
];

/// The Needs you / FYI switch at the top of the Inbox, with each lane's
/// count.
class FleetInboxLaneSwitch extends StatelessWidget {
  const FleetInboxLaneSwitch({
    required this.lane,
    required this.needsYou,
    required this.fyi,
    required this.onChanged,
    super.key,
  });

  final FleetInboxLane lane;
  final int needsYou;
  final int fyi;
  final ValueChanged<FleetInboxLane> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppSegmentedControl<FleetInboxLane>(
        segments: [
          AppSegment(
            value: FleetInboxLane.needsYou,
            label: l10n.mastermindFleetInboxNeedsYouTab(needsYou),
          ),
          AppSegment(
            value: FleetInboxLane.fyi,
            label: l10n.mastermindFleetInboxFyiTab(fyi),
          ),
        ],
        selected: lane,
        onChanged: onChanged,
      ),
    );
  }
}
