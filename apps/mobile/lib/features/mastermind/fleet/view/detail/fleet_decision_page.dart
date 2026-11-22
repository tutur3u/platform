import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_snooze_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/fleet/view/detail/fleet_answer_panel.dart';
import 'package:mobile/features/mastermind/fleet/view/detail/fleet_decision_detail.dart';
import 'package:mobile/features/mastermind/fleet/view/detail/fleet_option_carousel.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_groups.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_login_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_reply_sheet.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_review_preview.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_snooze.dart';
import 'package:mobile/features/mastermind/fleet/view/preview/fleet_mockup_view.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox/ask/:decisionId`: one fleet decision in full.
///
/// An open decision reads top to bottom and is answered here: Choose turns
/// into Send in place, Send closes the decision at once with an Undo toast
/// and moves to the next one, and delivery continues in the background.
/// The navbar's arrows step through Needs you and FYI. A decision already
/// answered or closed opens read-only with its recorded answer.
class FleetDecisionPage extends StatefulWidget {
  const FleetDecisionPage({
    required this.decisionId,
    this.now,
    this.launch,
    this.reviewAssets,
    this.webView = fleetMockupWebView,
    super.key,
  });

  final String decisionId;
  final DateTime Function()? now;

  /// Test seam for the app's link launcher.
  final MobileLinkLaunch? launch;

  /// Test seam for review asset bytes; the fleet repository otherwise.
  final FleetReviewAssetLoader? reviewAssets;
  final FleetMockupWebView webView;

  @override
  State<FleetDecisionPage> createState() => _FleetDecisionPageState();
}

class _FleetDecisionPageState extends State<FleetDecisionPage> {
  late final MastermindRuntime _runtime = context.read<MastermindRuntime>();
  late final FleetReviewAssetLoader _assets =
      widget.reviewAssets ?? FleetRepository().reviewAsset;

  FleetCubit get _fleet => _runtime.fleet;

  @override
  void initState() {
    super.initState();
    unawaited(_runtime.fleetSnoozes.load());
  }

  void _go(String decisionId) =>
      context.replace(Routes.mastermindFleetDecisionPath(decisionId));

  void _leave(String? next) {
    if (!mounted) return;
    if (next != null) {
      _go(next);
    } else if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.mastermindInbox);
    }
  }

  DateTime _now() => (widget.now ?? DateTime.now)().toUtc();

  /// The Inbox as it stands now, not as the last build saw it.
  FleetInboxGroups? _groupsNow() {
    final snapshot = _fleet.state.snapshot;
    if (snapshot == null) return null;
    return FleetInboxGroups(
      snapshot,
      _runtime.fleetSnoozes.state,
      _now(),
      pending: _fleet.state.pending,
      seen: _fleet.seenDecision,
    );
  }

  /// Whether [decisionId] can still be answered: listed in Needs you or FYI,
  /// or snoozed, in the current snapshot.
  static bool _isOpen(FleetInboxGroups? groups, String decisionId) =>
      groups != null &&
      (groups.order.contains(decisionId) ||
          groups.snoozed.any((pair) => pair.$1.id == decisionId));

  /// The decision after [decisionId] in the current order, if any.
  static String? _nextAfter(FleetInboxGroups? groups, String decisionId) {
    final order = groups?.order ?? const <String>[];
    final index = order.indexOf(decisionId);
    return index >= 0 && index + 1 < order.length ? order[index + 1] : null;
  }

  /// Records the answer at once (it leaves Needs you), offers Undo for the
  /// undo window, and moves on to the decision that follows it now;
  /// delivery retries in the background.
  void _commit(
    FleetDecision decision,
    FleetAnswerAction action, {
    required String label,
    String? optionId,
    String? text,
  }) {
    final l10n = context.l10n;
    final next = _nextAfter(_groupsNow(), decision.id);
    unawaited(
      _fleet.answer(decision.id, action, optionId: optionId, text: text),
    );
    unawaited(AppHaptics.success());
    showAppToast(
      context,
      message: l10n.mastermindFleetAnsweredToast(label),
      variant: AppAlertVariant.success,
      actionLabel: l10n.mastermindFleetUndo,
      onAction: () => _fleet.undo(decision.id),
      duration: MastermindRuntime.fleetUndoWindow,
    );
    _leave(next);
  }

  Future<String?> _notes(FleetDecision decision, String orchestrator) =>
      showFleetReplySheet(
        context,
        orchestrator: orchestrator,
        question: decision.title,
      );

  /// Sends written words once the sheet closes, but only if the decision is
  /// still open: another device may have answered or closed it meanwhile.
  /// Then nothing is sent and Copy text keeps the words. A second answer is
  /// never offered: Iris takes only the first one, so it would be lost.
  void _sendWritten(
    FleetDecision decision,
    FleetAnswerAction action, {
    required String label,
    required String text,
  }) {
    final groups = _groupsNow();
    if (_isOpen(groups, decision.id)) {
      _commit(decision, action, label: label, text: text);
      return;
    }
    final l10n = context.l10n;
    final live =
        _fleet.state.snapshot?.decisions.any((d) => d.id == decision.id) ??
        false;
    unawaited(AppHaptics.warning());
    showAppToast(
      context,
      message: live
          ? l10n.mastermindFleetNotSentAnswered
          : l10n.mastermindFleetNotSentClosed,
      variant: AppAlertVariant.warning,
      actionLabel: l10n.mastermindFleetCopyText,
      onAction: () => unawaited(Clipboard.setData(ClipboardData(text: text))),
      duration: const Duration(seconds: 8),
    );
  }

  Future<void> _choose(
    FleetDecision decision,
    FleetChoice choice,
    String orchestrator,
  ) async {
    if (!choice.needsText) {
      _commit(
        decision,
        choice.action,
        label: choice.label,
        optionId: choice.optionId,
      );
      return;
    }
    final text = await _notes(decision, orchestrator);
    if (text == null || !mounted) return;
    _sendWritten(decision, choice.action, label: choice.label, text: text);
  }

  Future<void> _reply(FleetDecision decision, String orchestrator) async {
    final text = await _notes(decision, orchestrator);
    if (text == null || !mounted) return;
    _sendWritten(
      decision,
      FleetAnswerAction.reply,
      label: context.l10n.mastermindFleetAnswerReplied,
      text: text,
    );
  }

  Future<void> _snooze(FleetDecision decision) async {
    final next = _nextAfter(_groupsNow(), decision.id);
    await snoozeFleetDecision(context, decision, now: widget.now);
    final until = _runtime.fleetSnoozes.state[decision.id];
    if (until != null && until.isAfter(_now())) _leave(next);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final location = GoRouterState.of(context).matchedLocation;
    return FleetSection(
      builder: (context, snapshot, state) =>
          BlocBuilder<FleetSnoozeCubit, Map<String, DateTime>>(
            bloc: _runtime.fleetSnoozes,
            builder: (context, snoozes) => FleetClock(
              period: const Duration(seconds: 15),
              now: widget.now,
              builder: (context, now) {
                final groups = FleetInboxGroups(
                  snapshot,
                  snoozes,
                  now,
                  pending: state.pending,
                  seen: _fleet.seenDecision,
                );
                final order = groups.order;
                final index = order.indexOf(widget.decisionId);
                String? at(int i) =>
                    i >= 0 && i < order.length ? order[i] : null;
                final prev = index < 0 ? null : at(index - 1);
                final next = index < 0 ? null : at(index + 1);
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ShellTitleOverride(
                      ownerId: 'mastermind-fleet-decision',
                      locations: {location},
                      title: l10n.mastermindFleetDecisionTitle,
                      showLeadingBrand: false,
                    ),
                    ShellChromeActions(
                      ownerId: 'mastermind-fleet-decision',
                      locations: {location},
                      actions: [
                        if (index >= 0 && order.length > 1) ...[
                          ShellActionSpec(
                            id: 'fleet-decision-previous',
                            icon: LucideIcons.chevronUp,
                            tooltip: l10n.mastermindFleetPreviousDecision,
                            enabled: prev != null,
                            // The shell compares specs by token, not by
                            // closure: a new target must replace the old.
                            callbackToken: prev,
                            onPressed: prev == null ? null : () => _go(prev),
                          ),
                          ShellActionSpec(
                            id: 'fleet-decision-next',
                            icon: LucideIcons.chevronDown,
                            tooltip: l10n.mastermindFleetNextDecision,
                            enabled: next != null,
                            callbackToken: next,
                            onPressed: next == null ? null : () => _go(next),
                          ),
                        ],
                      ],
                    ),
                    Expanded(
                      child: _content(
                        context,
                        snapshot,
                        state,
                        groups,
                        index: index,
                        total: order.length,
                        next: next,
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
    );
  }

  Widget _content(
    BuildContext context,
    FleetSnapshot snapshot,
    FleetViewState state,
    FleetInboxGroups groups, {
    required int index,
    required int total,
    required String? next,
  }) {
    final l10n = context.l10n;
    final id = widget.decisionId;
    final orchestrator = snapshot.orchestratorLabel;
    final live = snapshot.decisions.where((d) => d.id == id).firstOrNull;
    final entry = groups.history.where((e) => e.id == id).firstOrNull;
    final open = index >= 0 || groups.snoozed.any((pair) => pair.$1.id == id);
    final decision = live ?? entry?.decision ?? _fleet.seenDecision(id);
    final secret =
        decision?.kind == FleetDecisionKind.secret ||
        snapshot.resolved.any(
          (d) => d.id == id && d.kind == FleetDecisionKind.secret,
        );
    final pending = state.pending[id];
    final nextDecision = next == null
        ? null
        : snapshot.decisions.where((d) => d.id == next).firstOrNull;
    final Widget body;
    if (!secret && decision == null && entry != null) {
      // Closed before this session saw it: only its title and record.
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(entry.title, style: AppTokens.of(context).typography.title),
          const SizedBox(height: AppSpacing.lg),
          FleetAnswerPanel(entry: entry, orchestrator: orchestrator),
        ],
      );
    } else if (secret || decision == null) {
      body = AppStateMessage(
        icon: LucideIcons.circleCheck,
        title: l10n.mastermindFleetDecisionGone,
        actionLabel: l10n.mastermindFleetBackToInbox,
        onAction: () => _leave(null),
      );
    } else {
      final returned = pending != null && pending.needsOwner && open;
      final label = returned
          ? fleetAnswerLabel(l10n, decision, pending.action, pending.optionId)
          : null;
      final login = decision.login;
      // Only the current snapshot decides what can still be answered: a
      // cached or closed decision reads only, with no sign-in code or link.
      body = FleetDecisionDetail(
        decision: decision,
        orchestrator: orchestrator,
        readOnly: !open,
        entry: open ? null : entry,
        position: index >= 0 ? (index + 1, total) : null,
        next: nextDecision,
        onOpenNext: next == null ? null : () => _go(next),
        loadAsset: _assets,
        launch: widget.launch,
        webView: widget.webView,
        now: widget.now,
        onSend: (choice) => unawaited(_choose(decision, choice, orchestrator)),
        onReply: () => unawaited(_reply(decision, orchestrator)),
        onHold: () => _commit(
          decision,
          FleetAnswerAction.hold,
          label: l10n.mastermindFleetAnswerHeld,
        ),
        onSnooze: decision.login == null
            ? () => unawaited(_snooze(decision))
            : null,
        onUndo: () => _fleet.undo(id),
        onRetry: () => unawaited(_fleet.retry(id)),
        notice: returned
            ? AppAlert.destructive(
                title: Text(
                  pending.stalled
                      ? l10n.mastermindFleetNotDeliveredYet(label!)
                      : l10n.mastermindFleetNotDelivered(label!),
                ),
                trailing: AppButton.outline(
                  size: AppButtonSize.small,
                  // An attempt already on the wire finishes first.
                  enabled: pending.status != FleetSendStatus.sending,
                  loading: pending.status == FleetSendStatus.sending,
                  onPressed: () => unawaited(_fleet.retry(id)),
                  child: Text(l10n.mastermindFleetRetry),
                ),
              )
            : !open && entry == null
            ? AppAlert(title: Text(l10n.mastermindFleetDecisionGone))
            : null,
        loginCard: login == null || !open
            ? null
            : FleetLoginCard(
                key: ValueKey('fleet-login-$id'),
                decision: decision,
                login: login,
                machine: snapshot.machineLabel(login.machineId),
                orchestrator: orchestrator,
                receipt: snapshot.answers[id],
                pending: pending,
                now: widget.now,
                launch: widget.launch,
                onSignedIn: () =>
                    unawaited(_fleet.answer(id, FleetAnswerAction.signedIn)),
                onRetry: () => unawaited(_fleet.retry(id)),
                onUndo: () => _fleet.undo(id),
                onDismiss: () => _fleet.dismiss(id),
              ),
      );
    }
    return AppPageScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [SliverToBoxAdapter(child: body)],
    );
  }
}
