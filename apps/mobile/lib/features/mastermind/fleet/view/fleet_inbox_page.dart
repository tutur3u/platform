import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_snooze_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_decision_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_line.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_groups.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_lanes.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_login_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_review_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_review_preview.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_snooze.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_undelivered_row.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_entry.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox`: a Needs you / FYI switch over two lanes. Needs you
/// holds open asks, sign-in requests and design reviews, most urgent first,
/// then what is snoozed on this device; answering a card moves on to the
/// next one. FYI holds updates, answers that did not arrive, and answers
/// with how far they got, here or on another channel. A snoozed card
/// returns on its own when its time passes.
class FleetInboxPage extends StatefulWidget {
  const FleetInboxPage({this.now, this.launch, this.reviewAssets, super.key});

  final DateTime Function()? now;

  /// Test seam for the app's link launcher.
  final MobileLinkLaunch? launch;

  /// Test seam for review preview bytes; the fleet repository otherwise.
  final FleetReviewAssetLoader? reviewAssets;

  @override
  State<FleetInboxPage> createState() => _FleetInboxPageState();
}

class _FleetInboxPageState extends State<FleetInboxPage> {
  late final MastermindRuntime _runtime = context.read<MastermindRuntime>();
  late final FleetReviewAssetLoader _assets =
      widget.reviewAssets ?? FleetRepository().reviewAsset;
  final _cardKeys = <String, GlobalKey>{};
  final _replyFocus = <String, FocusNode>{};
  FleetInboxLane _lane = FleetInboxLane.needsYou;
  List<String> _needsOrder = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_runtime.fleetSnoozes.load());
  }

  @override
  void dispose() {
    for (final node in _replyFocus.values) {
      node.dispose();
    }
    super.dispose();
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

  /// Send and next: brings the card after [decisionId] to the top of the
  /// screen unless its top already shows in the upper half, and focuses its
  /// reply box when the answer was typed.
  void _advance(String decisionId, {required bool typed}) {
    final index = _needsOrder.indexOf(decisionId);
    if (index < 0 || index + 1 >= _needsOrder.length) return;
    final next = _needsOrder[index + 1];
    final reduced = MediaQuery.disableAnimationsOf(context);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _cardKeys[next]?.currentContext;
      if (!mounted || target == null || !target.mounted) return;
      final scrollable = Scrollable.maybeOf(target);
      final card = target.findRenderObject();
      final frame = scrollable?.context.findRenderObject();
      if (scrollable == null || card is! RenderBox || frame is! RenderBox) {
        return;
      }
      final top = card.localToGlobal(Offset.zero, ancestor: frame).dy;
      if (top < 0 || top > frame.size.height / 2) {
        unawaited(
          Scrollable.ensureVisible(
            target,
            alignment: 0.05,
            duration: reduced
                ? Duration.zero
                : const Duration(milliseconds: 250),
          ),
        );
      }
      if (typed) _replyFocus[next]?.requestFocus();
    });
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
    DateTime now, {
    bool snoozable = true,
  }) {
    final fleet = _runtime.fleet;
    final id = decision.id;
    final receipt = snapshot.answers[id];
    final pending = state.pending[id];
    final actionable = decision.login?.isOpenAt(now) ?? true;
    final snooze = snoozable && actionable && receipt == null
        ? () =>
              unawaited(snoozeFleetDecision(context, decision, now: widget.now))
        : null;
    void answer(FleetAnswerAction action, {String? optionId, String? text}) {
      unawaited(fleet.answer(id, action, optionId: optionId, text: text));
      _advance(id, typed: text != null);
    }

    void retry() => unawaited(fleet.retry(id));
    void undo() => fleet.undo(id);
    void dismiss() => fleet.dismiss(id);
    final login = decision.login;
    final review = decision.review;
    final orchestrator = snapshot.orchestratorLabel;
    final child = login != null
        ? FleetLoginCard(
            key: ValueKey('fleet-login-$id'),
            decision: decision,
            login: login,
            machine: snapshot.machineLabel(login.machineId),
            orchestrator: orchestrator,
            receipt: receipt,
            pending: pending,
            now: widget.now,
            launch: widget.launch,
            onSignedIn: () => answer(FleetAnswerAction.signedIn),
            onRetry: retry,
            onUndo: undo,
            onDismiss: dismiss,
            onSnooze: snooze,
          )
        : review != null
        ? FleetReviewCard(
            key: ValueKey('fleet-review-$id'),
            decision: decision,
            review: review,
            orchestrator: orchestrator,
            receipt: receipt,
            pending: pending,
            now: widget.now,
            launch: widget.launch,
            loadAsset: _assets,
            onAnswer: answer,
            onRetry: retry,
            onUndo: undo,
            onDismiss: dismiss,
            onSnooze: snooze,
          )
        : FleetDecisionCard(
            key: ValueKey('fleet-decision-$id'),
            decision: decision,
            orchestrator: orchestrator,
            receipt: receipt,
            pending: pending,
            now: widget.now,
            replyFocus: _replyFocus.putIfAbsent(id, FocusNode.new),
            onAnswer: answer,
            onRetry: retry,
            onUndo: undo,
            onDismiss: dismiss,
            onSnooze: snooze,
          );
    return Padding(
      key: _cardKeys.putIfAbsent(id, GlobalKey.new),
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: child,
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
    _needsOrder = [for (final d in groups.needs) d.id];
    Widget card(FleetDecision decision, {bool snoozable = true}) =>
        _card(snapshot, state, decision, now, snoozable: snoozable);
    return AppPageScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverList.list(
          children: [
            FleetFreshnessLine(state: state, now: widget.now),
            FleetInboxLaneSwitch(
              lane: _lane,
              needsYou: groups.openCount,
              fyi: groups.fyiCount + snapshot.alerts.length,
              onChanged: (lane) => setState(() => _lane = lane),
            ),
            ...switch (_lane) {
              FleetInboxLane.needsYou => fleetNeedsYouLane(
                l10n,
                groups,
                card: card,
                onWake: (id) => unawaited(_runtime.fleetSnoozes.wake(id)),
              ),
              FleetInboxLane.fyi => fleetFyiLane(
                l10n,
                snapshot,
                groups,
                card: card,
                now: now,
                clock: widget.now,
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
