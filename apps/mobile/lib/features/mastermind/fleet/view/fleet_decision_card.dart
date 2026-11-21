import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_answer_status.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_ask_header.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_ask_options.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_decision_context.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inline_reply.dart';

export 'package:mobile/features/mastermind/fleet/view/fleet_ask_options.dart'
    show FleetAnswerCallback;

/// One ask: urgency, who asks and the deadline countdown, the question, why
/// it is asked and what happens without an answer, then numbered options
/// (the recommended one filled) and a one-line reply that goes to the asking
/// lane. Once answered, the answer line replaces the actions.
class FleetDecisionCard extends StatelessWidget {
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
    this.replyFocus,
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

  /// The reply box's focus, so the Inbox can move to it after the previous
  /// card was answered.
  final FocusNode? replyFocus;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final status = fleetAnswerStatus(
      receipt: receipt,
      pending: pending,
      orchestrator: orchestrator,
      onRetry: onRetry,
      onUndo: onUndo ?? () {},
      onDismiss: onDismiss,
      now: now,
    );
    final sending = pending?.status == FleetSendStatus.sending
        ? pending!.action
        : null;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FleetAskHeader(decision: decision, now: now),
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
          FleetDecisionContext(decision: decision, showRequester: false),
          const SizedBox(height: AppSpacing.md),
          ?status,
          if (status == null) ...[
            FleetAskOptions(
              decision: decision,
              sending: sending,
              onAnswer: onAnswer,
              onSnooze: onSnooze,
            ),
            const SizedBox(height: AppSpacing.sm),
            FleetInlineReply(
              focusNode: replyFocus,
              enabled: sending == null,
              onSend: (text) => onAnswer(FleetAnswerAction.reply, text: text),
            ),
          ],
        ],
      ),
    );
  }
}
