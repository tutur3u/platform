import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_alerts_panel.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_history_row.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_groups.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_rows.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_mobile_issue_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// The three Inbox lanes.
enum FleetInboxLane { needsYou, fyi, history }

typedef FleetInboxCardBuilder = Widget Function(FleetDecision decision);

Widget _gap(Widget child) => Padding(
  padding: const EdgeInsets.only(bottom: AppSpacing.md),
  child: child,
);

/// Needs you: every open ask, sign-in request and review as a compact card,
/// most urgent first, then what is snoozed on this device.
List<Widget> fleetNeedsYouLane(
  AppLocalizations l10n,
  FleetInboxGroups groups, {
  required FleetInboxCardBuilder card,
  required void Function(String decisionId) onWake,
  List<FleetMobileIssue> mobileIssues = const [],
}) => [
  for (final alert in mobileIssues) _gap(FleetMobileIssueRow(alert: alert)),
  if (groups.needs.isEmpty && mobileIssues.isEmpty)
    _gap(
      AppStateMessage.inline(
        icon: LucideIcons.circleCheck,
        title: l10n.mastermindFleetInboxEmpty,
        tone: AppTone.success,
      ),
    ),
  for (final decision in groups.needs) _gap(card(decision)),
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

/// FYI: open items that only inform, and firing SLO alerts.
List<Widget> fleetFyiLane(
  AppLocalizations l10n,
  FleetSnapshot snapshot,
  FleetInboxGroups groups, {
  required FleetInboxCardBuilder card,
  DateTime Function()? clock,
}) => [
  for (final alert in snapshot.mobileIssues.where((alert) => !alert.urgent))
    _gap(FleetMobileIssueRow(alert: alert)),
  if (groups.fyiCount == 0 &&
      snapshot.mobileIssues.every((alert) => alert.urgent))
    _gap(
      AppStateMessage.inline(
        icon: LucideIcons.circleCheck,
        title: l10n.mastermindFleetInboxEmpty,
      ),
    ),
  if (snapshot.alerts.isNotEmpty)
    _gap(FleetAlertsPanel(alerts: snapshot.alerts, now: clock)),
  for (final decision in groups.fyi) _gap(card(decision)),
];

/// History: answers that did not arrive, then every answered or closed
/// decision grouped by ICT day, newest first.
List<Widget> fleetHistoryLane(
  BuildContext context,
  FleetInboxGroups groups, {
  required String orchestrator,
  required List<Widget> undelivered,
  required DateTime now,
  required void Function(FleetHistoryEntry entry) onOpen,
  required void Function(String decisionId) onUndo,
}) {
  final l10n = context.l10n;
  final locale = Localizations.localeOf(context).toLanguageTag();
  final days = <String, List<FleetHistoryEntry>>{};
  for (final entry in groups.history) {
    days
        .putIfAbsent(fleetHistoryDay(l10n, locale, entry.at, now), () => [])
        .add(entry);
  }
  return [
    ...undelivered,
    if (groups.history.isEmpty && undelivered.isEmpty)
      _gap(
        AppStateMessage.inline(
          icon: LucideIcons.history,
          title: l10n.mastermindFleetHistoryEmpty,
        ),
      ),
    for (final MapEntry(key: day, value: entries) in days.entries) ...[
      AppSectionHeader(title: day),
      _gap(
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (final (index, entry) in entries.indexed) ...[
                if (index > 0)
                  Divider(
                    height: 1,
                    thickness: 1,
                    color: AppTokens.of(context).colorScheme.border,
                  ),
                FleetHistoryRow(
                  key: ValueKey('fleet-history-${entry.id}'),
                  entry: entry,
                  orchestrator: orchestrator,
                  onTap: () => onOpen(entry),
                  onUndo: () => onUndo(entry.id),
                ),
              ],
            ],
          ),
        ),
      ),
    ],
  ];
}

/// The Needs you / FYI / History switch at the top of the Inbox. The two
/// counts cover only open items.
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
            label: needsYou > 0
                ? l10n.mastermindFleetInboxNeedsYouTab(needsYou)
                : l10n.mastermindFleetNeedsYouTitle,
          ),
          AppSegment(
            value: FleetInboxLane.fyi,
            label: fyi > 0
                ? l10n.mastermindFleetInboxFyiTab(fyi)
                : l10n.mastermindFleetFyi,
          ),
          AppSegment(
            value: FleetInboxLane.history,
            label: l10n.mastermindFleetInboxHistoryTab,
          ),
        ],
        selected: lane,
        onChanged: onChanged,
      ),
    );
  }
}
