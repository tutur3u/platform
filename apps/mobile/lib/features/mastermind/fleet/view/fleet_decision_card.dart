import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_answer_status.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_decision_context.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_reply_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

typedef FleetAnswerCallback =
    void Function(FleetAnswerAction action, {String? optionId, String? text});

/// One ask: the question, why it is asked, what happens without an answer,
/// who asks and the deadline countdown. With a recommendation the primary
/// button answers it in one tap and More reveals the other options and Hold;
/// Reply and Snooze are always there. Once answered it shows the answer line.
class FleetDecisionCard extends StatefulWidget {
  const FleetDecisionCard({
    required this.decision,
    required this.orchestrator,
    required this.onAnswer,
    required this.onRetry,
    this.onUndo,
    this.onDismiss,
    this.onSnooze,
    this.receipt,
    this.pending,
    this.now,
    super.key,
  });

  final FleetDecision decision;
  final String orchestrator;
  final FleetAnswerReceipt? receipt;
  final FleetPendingAnswer? pending;
  final DateTime Function()? now;
  final FleetAnswerCallback onAnswer;
  final VoidCallback onRetry;
  final VoidCallback? onUndo;
  final VoidCallback? onDismiss;
  final VoidCallback? onSnooze;

  @override
  State<FleetDecisionCard> createState() => _FleetDecisionCardState();
}

class _FleetDecisionCardState extends State<FleetDecisionCard> {
  late String? _option =
      widget.decision.recommendedOptionId ??
      (widget.decision.options.length == 1
          ? widget.decision.options.single.id
          : null);
  bool _more = false;

  Future<void> _reply() async {
    final text = await showFleetReplySheet(
      context,
      orchestrator: widget.orchestrator,
      question: widget.decision.title,
    );
    if (text != null && text.trim().isNotEmpty) {
      widget.onAnswer(
        FleetAnswerAction.reply,
        optionId: _option,
        text: text.trim(),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final decision = widget.decision;
    final status = fleetAnswerStatus(
      receipt: widget.receipt,
      pending: widget.pending,
      orchestrator: widget.orchestrator,
      onRetry: widget.onRetry,
      onUndo: widget.onUndo ?? () {},
      onDismiss: widget.onDismiss,
      now: widget.now,
    );
    final recommended = decision.recommended;
    final showOptions =
        status == null &&
        decision.options.isNotEmpty &&
        (recommended == null || _more);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FleetDecisionMeta(decision: decision, now: widget.now),
          const SizedBox(height: AppSpacing.sm),
          Text(decision.title, style: tokens.typography.large),
          if (decision.body case final body?) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              body,
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ],
          FleetDecisionContext(decision: decision),
          if (showOptions) ...[
            const SizedBox(height: AppSpacing.md),
            _Options(
              decision: decision,
              selected: _option,
              onSelected: (id) => setState(() => _option = id),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          status ?? _actions(context, recommended),
        ],
      ),
    );
  }

  Widget _actions(BuildContext context, FleetOption? recommended) {
    final l10n = context.l10n;
    final sending = widget.pending?.status == FleetSendStatus.sending;
    bool loading(FleetAnswerAction action) =>
        sending && widget.pending?.action == action;
    final oneTap = recommended != null && !_more;
    final needsOption = widget.decision.options.length > 1 && _option == null;
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (oneTap)
          AppBadge.outline(
            leading: const Icon(LucideIcons.sparkles, size: 12),
            child: Text(l10n.mastermindFleetRecommended),
          ),
        AppButton.primary(
          loading: loading(FleetAnswerAction.approve),
          enabled: !sending && (oneTap || !needsOption),
          leading: const Icon(LucideIcons.check, size: 16),
          onPressed: () => widget.onAnswer(
            FleetAnswerAction.approve,
            optionId: oneTap ? recommended.id : _option,
          ),
          child: Text(oneTap ? recommended.label : l10n.mastermindFleetApprove),
        ),
        if (!oneTap)
          AppButton.outline(
            loading: loading(FleetAnswerAction.hold),
            enabled: !sending,
            leading: const Icon(LucideIcons.pause, size: 16),
            onPressed: () => widget.onAnswer(FleetAnswerAction.hold),
            child: Text(l10n.mastermindFleetHold),
          ),
        AppButton.ghost(
          loading: loading(FleetAnswerAction.reply),
          enabled: !sending,
          leading: const Icon(LucideIcons.messageSquare, size: 16),
          onPressed: () => unawaited(_reply()),
          child: Text(l10n.mastermindFleetReply),
        ),
        if (widget.onSnooze case final snooze?)
          AppButton.ghost(
            enabled: !sending,
            leading: const Icon(LucideIcons.alarmClock, size: 16),
            onPressed: snooze,
            child: Text(l10n.mastermindFleetSnooze),
          ),
        if (recommended != null)
          AppButton.ghost(
            enabled: !sending,
            onPressed: () => setState(() => _more = !_more),
            child: Text(
              _more ? l10n.mastermindFleetFewer : l10n.mastermindFleetMore,
            ),
          ),
      ],
    );
  }
}

class _Options extends StatelessWidget {
  const _Options({
    required this.decision,
    required this.selected,
    required this.onSelected,
  });

  final FleetDecision decision;
  final String? selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final option in decision.options)
          AppChip(
            label: Text(
              option.id == decision.recommendedOptionId
                  ? '${option.label} · ${l10n.mastermindFleetRecommended}'
                  : option.label,
            ),
            selected: selected == option.id,
            inMutuallyExclusiveGroup: true,
            onSelected: (_) => onSelected(option.id),
          ),
      ],
    );
  }
}
