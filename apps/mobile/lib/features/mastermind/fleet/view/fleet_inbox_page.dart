import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_snooze_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_decision_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_line.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_groups.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_rows.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_login_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_snooze.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_undelivered_row.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_entry.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox`: urgent asks, access requests, decisions and FYI,
/// then what is snoozed on this device and what was answered, here or on
/// another channel. A snoozed card returns on its own when its time passes.
class FleetInboxPage extends StatefulWidget {
  const FleetInboxPage({this.now, this.launch, super.key});

  final DateTime Function()? now;

  /// Test seam for the app's link launcher.
  final MobileLinkLaunch? launch;

  @override
  State<FleetInboxPage> createState() => _FleetInboxPageState();
}

class _FleetInboxPageState extends State<FleetInboxPage> {
  late final MastermindRuntime _runtime = context.read<MastermindRuntime>();

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

  Widget _body(
    BuildContext context,
    FleetSnapshot snapshot,
    FleetViewState state,
    FleetInboxGroups groups,
    DateTime now,
  ) {
    final l10n = context.l10n;
    final fleet = _runtime.fleet;
    final snoozes = _runtime.fleetSnoozes;
    Widget card(FleetDecision decision, {bool snoozable = true}) {
      final receipt = snapshot.answers[decision.id];
      final pending = state.pending[decision.id];
      final actionable = decision.login?.isOpenAt(now) ?? true;
      final snooze = snoozable && actionable && receipt == null
          ? () => unawaited(
              snoozeFleetDecision(context, decision, now: widget.now),
            )
          : null;
      final login = decision.login;
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: login != null
            ? FleetLoginCard(
                key: ValueKey('fleet-login-${decision.id}'),
                decision: decision,
                login: login,
                machine: snapshot.machineLabel(login.machineId),
                orchestrator: snapshot.orchestratorLabel,
                receipt: receipt,
                pending: pending,
                now: widget.now,
                launch: widget.launch,
                onSignedIn: () => unawaited(
                  fleet.answer(decision.id, FleetAnswerAction.signedIn),
                ),
                onRetry: () => unawaited(fleet.retry(decision.id)),
                onUndo: () => fleet.undo(decision.id),
                onDismiss: () => fleet.dismiss(decision.id),
                onSnooze: snooze,
              )
            : FleetDecisionCard(
                key: ValueKey('fleet-decision-${decision.id}'),
                decision: decision,
                orchestrator: snapshot.orchestratorLabel,
                receipt: receipt,
                pending: pending,
                now: widget.now,
                onAnswer: (action, {optionId, text}) => unawaited(
                  fleet.answer(
                    decision.id,
                    action,
                    optionId: optionId,
                    text: text,
                  ),
                ),
                onRetry: () => unawaited(fleet.retry(decision.id)),
                onUndo: () => fleet.undo(decision.id),
                onDismiss: () => fleet.dismiss(decision.id),
                onSnooze: snooze,
              ),
      );
    }

    List<Widget> tier(String title, List<FleetDecision> decisions) => [
      if (decisions.isNotEmpty) ...[
        AppSectionHeader(title: title, count: decisions.length),
        ...decisions.map(card),
      ],
    ];

    return AppPageScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverList.list(
          children: [
            FleetFreshnessLine(state: state, now: widget.now),
            if (groups.openCount == 0)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                child: AppStateMessage.inline(
                  icon: LucideIcons.circleCheck,
                  title: l10n.mastermindFleetInboxEmpty,
                  tone: AppTone.success,
                ),
              ),
            ...tier(l10n.mastermindFleetTierUrgent, groups.urgent),
            ...tier(l10n.mastermindFleetTierAccess, groups.access),
            ...tier(l10n.mastermindFleetTierDecide, groups.decide),
            ...tier(l10n.mastermindFleetTierFyi, groups.fyi),
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
                  onWake: () => unawaited(snoozes.wake(decision.id)),
                ),
              const SizedBox(height: AppSpacing.md),
            ],
            ...fleetUndeliveredSection(
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
            if (groups.answered.isNotEmpty || groups.resolved.isNotEmpty) ...[
              AppSectionHeader(
                title: l10n.mastermindFleetAnsweredTitle,
                count: groups.answered.length + groups.resolved.length,
              ),
              for (final decision in groups.answered)
                card(decision, snoozable: false),
              for (final resolved in groups.resolved)
                FleetResolvedRow(
                  key: ValueKey('fleet-resolved-${resolved.id}'),
                  resolved: resolved,
                  now: now,
                ),
            ],
            const FleetAccessRequestsRow(),
          ],
        ),
      ],
    );
  }
}
