import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_state.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/features/mastermind/projects/view/reply_receipt_line.dart';
import 'package:mobile/l10n/l10n.dart';

/// A transcript message. User-role messages sit on the right, assistant
/// messages on the left; neither names an author, since a user message can
/// come from another agent.
class ThreadMessageBubble extends StatelessWidget {
  const ThreadMessageBubble({required this.message, super.key});

  final ThreadMessage message;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final mine = message.role == ThreadMessageRole.user;
    return ThreadBubbleFrame(
      user: mine,
      time: message.at,
      children: [
        RedactedText(message.text),
        if (message.truncated)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: _Muted(l10n.mastermindProjectsTruncated, italic: true),
          ),
      ],
    );
  }
}

/// A reply posted from this screen, with its receipt line.
class PostedReplyBubble extends StatelessWidget {
  const PostedReplyBubble({
    required this.reply,
    required this.onRetry,
    required this.onSignIn,
    super.key,
  });

  final PostedReply reply;
  final VoidCallback onRetry;

  /// Starts the app's MFA step-up after a 401 `mfa_required`.
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final failure = reply.failure;
    return ThreadBubbleFrame(
      user: true,
      time: reply.at,
      children: [
        Text(reply.text),
        const SizedBox(height: 6),
        ReplyReceiptLine(phase: reply.phase),
        if (failure != null) ...[
          const SizedBox(height: 4),
          _Muted(failure.message(l10n)),
        ],
        if (reply.retryable)
          if (switch (failure) {
                ProjectsFailureKind.mfaRequired => (
                  l10n.mastermindProjectsSignInAgain,
                  onSignIn,
                ),
                // Only a transport failure can succeed by sending again.
                ProjectsFailureKind.unavailable ||
                ProjectsFailureKind.timeout ||
                ProjectsFailureKind.machineOffline ||
                null => (l10n.commonRetry, onRetry),
                _ => null,
              }
              case (final label, final onPressed))
            Align(
              alignment: Alignment.centerRight,
              child: AppButton(
                variant: AppButtonVariant.ghost,
                density: AppButtonDensity.compact,
                size: AppButtonSize.small,
                onPressed: onPressed,
                child: Text(label),
              ),
            ),
      ],
    );
  }
}

class ThreadBubbleFrame extends StatelessWidget {
  const ThreadBubbleFrame({
    required this.user,
    required this.time,
    required this.children,
    super.key,
  });

  final bool user;
  final DateTime time;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final at = TimeOfDay.fromDateTime(time.toLocal()).format(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: user
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          FractionallySizedBox(
            widthFactor: 0.88,
            alignment: user ? Alignment.centerRight : Alignment.centerLeft,
            child: Align(
              alignment: user ? Alignment.centerRight : Alignment.centerLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: user ? colors.accent : colors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: user ? null : Border.all(color: colors.border),
                ),
                child: DefaultTextStyle.merge(
                  style: const TextStyle(fontSize: 13, height: 1.4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: children,
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
            child: _Muted(at),
          ),
        ],
      ),
    );
  }
}

/// Message text with every `[redacted]` marker muted.
class RedactedText extends StatelessWidget {
  const RedactedText(this.text, {super.key});

  static const marker = '[redacted]';
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final parts = text.split(marker);
    return Text.rich(
      TextSpan(
        children: [
          for (final (index, part) in parts.indexed) ...[
            if (index > 0)
              TextSpan(
                text: marker,
                style: TextStyle(
                  color: colors.mutedForeground,
                  fontStyle: FontStyle.italic,
                ),
              ),
            TextSpan(text: part),
          ],
        ],
      ),
    );
  }
}

class _Muted extends StatelessWidget {
  const _Muted(this.text, {this.italic = false});

  final String text;
  final bool italic;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      color: AppTokens.of(context).colorScheme.mutedForeground,
      fontSize: 11,
      fontStyle: italic ? FontStyle.italic : null,
    ),
  );
}
