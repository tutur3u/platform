import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_snooze_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_compact_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_line.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_groups.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_lanes.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_login_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_snooze.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_undelivered_row.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_entry.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/projects/view/projects_inbox_action.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/l10n/l10n.dart';

/// The label of an answer to [decision]: the chosen option, else the
/// [action] in words ("Approved", "On hold").
String fleetAnswerLabel(
  AppLocalizations l10n,
  FleetDecision? decision,
  FleetAnswerAction action,
  String? optionId,
) =>
    decision?.options.where((o) => o.id == optionId).firstOrNull?.label ??
    action.doneLabel(l10n);

/// `/mastermind/inbox`: Needs you, FYI and History lanes.
///
/// Needs you lists open asks and design reviews as compact cards, most
/// urgent first, then what is snoozed on this device. Tapping a card opens
/// the decision in full, where the owner answers. Sign-in requests stay
/// whole in the list: their codes expire in minutes, so the code, the link
/// and I signed in are one tap away. An answer
/// leaves Needs you at once and is delivered in the background; one that
/// is refused or stalls returns here with the reason and Retry. FYI holds
/// open items that only inform; History lists answered and closed
/// decisions. The Needs you and FYI counts cover only open items.
class FleetInboxPage extends StatefulWidget {
  const FleetInboxPage({
    this.now,
    this.launch,
    this.secretCardsReady = fleetSecretCardsReady,
    this.openSecret,
    super.key,
  });

  final DateTime Function()? now;

  /// Test seam for the app's link launcher.
  final MobileLinkLaunch? launch;

  /// Gate for rendering `secret` decisions in the Inbox; defaults to
  /// [fleetSecretCardsReady].
  final bool secretCardsReady;

  /// Test seam for opening the full-screen secret entry flow.
  final Future<void> Function(BuildContext context, FleetDecision decision)?
  openSecret;

  @override
  State<FleetInboxPage> createState() => _FleetInboxPageState();
}

class _FleetInboxPageState extends State<FleetInboxPage> {
  late final MastermindRuntime _runtime = context.read<MastermindRuntime>();
  FleetInboxLane _lane = FleetInboxLane.needsYou;

  @override
  void initState() {
    super.initState();
    unawaited(_runtime.fleetSnoozes.load());
  }

  DateTime _now() => (widget.now ?? DateTime.now)().toUtc();

  void _prune(FleetViewState state) {
    final snapshot = state.snapshot;
    if (snapshot == null) return;
    unawaited(
      _runtime.fleetSnoozes.prune({
        for (final d in snapshot.needsYouAt(_now())) d.id,
      }, _now()),
    );
  }

  void _open(String decisionId) =>
      unawaited(context.push(Routes.mastermindFleetDecisionPath(decisionId)));

  Future<void> _openSecret(FleetDecision decision) {
    final opener = widget.openSecret;
    if (opener != null) return opener(context, decision);
    return showFleetSecretPage(context, decision: decision, now: widget.now);
  }

  @override
  Widget build(BuildContext context) =>
      BlocListener<FleetCubit, FleetViewState>(
        bloc: _runtime.fleet,
        listenWhen: (a, b) => a.snapshot != b.snapshot,
        listener: (_, state) {
          // Also picks up the next account's snoozes after a switch.
          unawaited(_runtime.fleetSnoozes.load());
          _prune(state);
        },
        child: FleetSection(
          builder: (context, snapshot, state) =>
              BlocBuilder<FleetSnoozeCubit, Map<String, DateTime>>(
                bloc: _runtime.fleetSnoozes,
                builder: (context, snoozes) => FleetClock(
                  period: const Duration(seconds: 15),
                  now: widget.now,
                  builder: (context, now) => _body(
                    context,
                    snapshot,
                    state,
                    FleetInboxGroups(
                      snapshot,
                      snoozes,
                      now,
                      pending: state.pending,
                      seen: _runtime.fleet.seenDecision,
                      secretCardsReady: widget.secretCardsReady,
                      handledSecrets: state.handledSecrets,
                    ),
                    now,
                  ),
                ),
              ),
        ),
      );

  Widget _card(
    FleetSnapshot snapshot,
    FleetViewState state,
    FleetDecision decision,
    DateTime now,
  ) {
    final l10n = context.l10n;
    final pending = state.pending[decision.id];
    final fleet = _runtime.fleet;
    final id = decision.id;
    if (decision.login case final login?) {
      final receipt = snapshot.answers[id];
      return FleetLoginCard(
        key: ValueKey('fleet-login-$id'),
        decision: decision,
        login: login,
        machine: snapshot.machineLabel(login.machineId),
        orchestrator: snapshot.orchestratorLabel,
        receipt: receipt,
        pending: pending,
        now: widget.now,
        launch: widget.launch,
        onSignedIn: () =>
            unawaited(fleet.answer(id, FleetAnswerAction.signedIn)),
        onRetry: () => unawaited(fleet.retry(id)),
        onUndo: () => fleet.undo(id),
        onDismiss: () => fleet.dismiss(id),
        onSnooze: login.isOpenAt(now) && receipt == null
            ? () => unawaited(
                snoozeFleetDecision(context, decision, now: widget.now),
              )
            : null,
      );
    }
    final returned = pending != null && pending.needsOwner;
    final label = returned
        ? fleetAnswerLabel(l10n, decision, pending.action, pending.optionId)
        : null;
    return FleetCompactCard(
      key: ValueKey('fleet-card-${decision.id}'),
      decision: decision,
      now: widget.now,
      status: returned ? FleetCardStatus.failed : FleetCardStatus.idle,
      answer: label,
      retryLabel: returned && pending.stalled
          ? l10n.mastermindFleetNotDeliveredYet(label!)
          : null,
      retrying: returned && pending.status == FleetSendStatus.sending,
      onRetry: returned
          ? () => unawaited(_runtime.fleet.retry(decision.id))
          : null,
      onTap: () => _open(decision.id),
    );
  }

  Widget _body(
    BuildContext context,
    FleetSnapshot snapshot,
    FleetViewState state,
    FleetInboxGroups groups,
    DateTime now,
  ) {
    final l10n = context.l10n;
    final fleet = _runtime.fleet;
    final urgentIssues = snapshot.mobileIssues
        .where((alert) => alert.urgent)
        .toList();
    Widget card(FleetDecision decision) =>
        _card(snapshot, state, decision, now);
    Widget secretCard(FleetDecision decision) => FleetSecretCard(
      decision: decision,
      machineLabel: snapshot.machineLabel(decision.secret!.machineId),
      now: widget.now,
      onOpen: () => unawaited(_openSecret(decision)),
    );
    return AppPageScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverList.list(
          children: [
            const ProjectsInboxAction(),
            FleetFreshnessLine(state: state, now: widget.now),
            FleetInboxLaneSwitch(
              lane: _lane,
              needsYou: groups.openCount + urgentIssues.length,
              fyi:
                  groups.fyiCount +
                  snapshot.mobileIssues.length -
                  urgentIssues.length,
              onChanged: (lane) => setState(() => _lane = lane),
            ),
            ...switch (_lane) {
              FleetInboxLane.needsYou => fleetNeedsYouLane(
                l10n,
                groups,
                card: card,
                mobileIssues: urgentIssues,
                secretCard: widget.secretCardsReady ? secretCard : null,
                onWake: (id) => unawaited(_runtime.fleetSnoozes.wake(id)),
              ),
              FleetInboxLane.fyi => fleetFyiLane(
                l10n,
                snapshot,
                groups,
                card: card,
                clock: widget.now,
              ),
              FleetInboxLane.history => fleetHistoryLane(
                context,
                groups,
                orchestrator: snapshot.orchestratorLabel,
                now: now,
                onOpen: (entry) => _open(entry.id),
                onUndo: fleet.undo,
                undelivered: fleetUndeliveredSection(
                  l10n,
                  groups.undelivered,
                  orchestrator: snapshot.orchestratorLabel,
                  onDismiss: fleet.dismiss,
                  sendNote:
                      _runtime.iris.isConfigured &&
                          mastermindIrisSendCapability.value
                      ? _runtime.iris.send
                      : null,
                ),
              ),
            },
            const FleetAccessRequestsRow(),
          ],
        ),
      ],
    );
  }
}
