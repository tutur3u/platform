import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';
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
            child: ThreadMutedText(
              l10n.mastermindProjectsTruncated,
              italic: true,
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
            child: ThreadMutedText(at),
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

/// Small muted text under and inside bubbles.
class ThreadMutedText extends StatelessWidget {
  const ThreadMutedText(this.text, {this.italic = false, super.key});

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
