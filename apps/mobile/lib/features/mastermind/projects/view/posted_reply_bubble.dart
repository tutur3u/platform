import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_thread_reply_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_step_up.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/features/mastermind/projects/view/reply_receipt_line.dart';
import 'package:mobile/features/mastermind/projects/view/reply_step_up_panel.dart';
import 'package:mobile/features/mastermind/projects/view/thread_bubbles.dart';
import 'package:mobile/l10n/l10n.dart';

/// One reply sent from this screen, with its receipt line and what can be
/// done next: renew the second factor in place, retry, or, while it is held
/// for the machine, check again or write another.
class PostedReplyBubble extends StatelessWidget {
  const PostedReplyBubble({
    required this.status,
    required this.onRetry,
    this.stepUp,
    this.onWriteAnother,
    super.key,
  });

  final FleetReplyStatus status;

  /// Resends a retryable failure, or a reply whose second factor was just
  /// renewed, under its key; while held, re-reads the receipt.
  final VoidCallback onRetry;

  /// Renews the second factor for a reply that needs it.
  final FleetReplyStepUp? stepUp;

  /// Only on the composer's reply.
  final VoidCallback? onWriteAnother;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final needsMfa = status.phase == FleetReplyPhase.needsMfa;
    final phase = replyPhaseOf(status);
    if (phase == null && !needsMfa) return const SizedBox.shrink();
    final failure = status.failure;
    final note = switch (status.phase) {
      FleetReplyPhase.needsMfa => l10n.mastermindProjectsErrorMfa,
      FleetReplyPhase.sent => l10n.mastermindProjectsStillDelivers,
      _ when failure != null => projectsFailureOf(
        FleetThreadException(failure, code: status.code),
      ).message(l10n),
      _ => null,
    };
    final actions = [
      if (status.phase == FleetReplyPhase.failed && status.retryable)
        (l10n.commonRetry, onRetry),
      if (status.phase == FleetReplyPhase.sent) ...[
        (l10n.mastermindProjectsCheckAgain, onRetry),
        if (onWriteAnother case final write?)
          (l10n.mastermindProjectsWriteAnother, write),
      ],
    ];
    return ThreadBubbleFrame(
      user: true,
      time: status.reply?.createdAt ?? DateTime.now(),
      children: [
        Text(status.text ?? ''),
        if (phase != null) ...[
          const SizedBox(height: 6),
          ReplyReceiptLine(phase: phase),
        ],
        if (note != null) ...[const SizedBox(height: 4), ThreadMutedText(note)],
        if (needsMfa)
          if (stepUp case final stepUp?)
            ReplyStepUpPanel(stepUp: stepUp, onVerified: onRetry),
        if (actions.isNotEmpty)
          Wrap(
            alignment: WrapAlignment.end,
            children: [
              for (final (label, onPressed) in actions)
                AppButton(
                  variant: AppButtonVariant.ghost,
                  density: AppButtonDensity.compact,
                  size: AppButtonSize.small,
                  onPressed: onPressed,
                  child: Text(label),
                ),
            ],
          ),
      ],
    );
  }
}
