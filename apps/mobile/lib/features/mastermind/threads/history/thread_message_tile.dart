import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';
import 'package:mobile/features/mastermind/threads/history/thread_text.dart';
import 'package:mobile/l10n/l10n.dart';

/// One history message, plain text only (D §1.3, §3.2): no Markdown, links,
/// images or remote loads, and redactions read as neutral placeholders.
class ThreadMessageTile extends StatelessWidget {
  const ThreadMessageTile({
    required this.message,
    required this.fallbackAuthor,
    super.key,
  });

  final ThreadMessage message;

  /// The thread's role, for an agent message without its own label.
  final String fallbackAuthor;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final muted = tokens.typography.small.copyWith(color: c.mutedForeground);
    final body = tokens.typography.base.copyWith(
      color: c.foreground,
      height: 1.4,
    );
    final time =
        '${Gmt7.day(message.createdAt, l10n.localeName)} '
        '${Gmt7.time(message.createdAt, l10n.localeName)}';
    final activity = threadActivityText(l10n, message.activity);
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppLayout.rowHorizontalPadding,
        vertical: AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Wraps rather than overflows at large text sizes.
          Wrap(
            spacing: AppSpacing.sm,
            crossAxisAlignment: WrapCrossAlignment.end,
            children: [
              Text(
                threadAuthorText(l10n, message, fallbackAuthor),
                style: tokens.typography.small.copyWith(
                  color: c.foreground,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(time, style: muted),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          if (message.withheld)
            Text(l10n.mastermindThreadHistoryWithheld, style: muted)
          else if (message.text.isNotEmpty)
            Text.rich(
              TextSpan(
                style: body,
                children: [
                  for (final run in threadTextRuns(message.text))
                    switch (run) {
                      PlainRun(:final text) => TextSpan(text: text),
                      final RedactionRun redaction => TextSpan(
                        text: '‹${redactionText(l10n, redaction)}›',
                        style: body.copyWith(
                          color: c.mutedForeground,
                          backgroundColor: c.muted,
                        ),
                      ),
                    },
                ],
              ),
            ),
          if (activity != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(activity, style: muted),
          ],
          if (message.truncated && !message.withheld) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(l10n.mastermindThreadHistoryRest, style: muted),
          ],
        ],
      ),
    );
  }
}

String threadAuthorText(
  AppLocalizations l10n,
  ThreadMessage message,
  String fallback,
) => switch (message.author) {
  ThreadAuthor.ownerMac => l10n.mastermindThreadAuthorOwnerMac,
  ThreadAuthor.ownerPhone => l10n.mastermindThreadAuthorOwnerPhone,
  ThreadAuthor.system => l10n.mastermindThreadAuthorSystem,
  ThreadAuthor.agent =>
    message.authorLabel.trim().isEmpty ? fallback : message.authorLabel,
};

String redactionText(AppLocalizations l10n, RedactionRun run) =>
    switch (run.kind) {
      RedactionKind.path => l10n.mastermindThreadRedactedPath,
      RedactionKind.link => switch (run.host) {
        final host? => l10n.mastermindThreadRedactedLinkHost(host),
        null => l10n.mastermindThreadRedactedLink,
      },
      RedactionKind.secret => l10n.mastermindThreadRedactedSecret,
      RedactionKind.id => l10n.mastermindThreadRedactedId,
      RedactionKind.email => l10n.mastermindThreadRedactedEmail,
      RedactionKind.number => l10n.mastermindThreadRedactedNumber,
      RedactionKind.other => l10n.mastermindThreadRedactedOther,
    };

/// "Ran 4 commands · Edited 2 files": a summary only, never expandable.
String? threadActivityText(AppLocalizations l10n, ThreadActivity? activity) {
  if (activity == null || activity.isEmpty) return null;
  return [
    if (activity.commands > 0)
      l10n.mastermindThreadActivityCommands(activity.commands),
    if (activity.edits > 0) l10n.mastermindThreadActivityEdits(activity.edits),
    if (activity.searches > 0)
      l10n.mastermindThreadActivitySearches(activity.searches),
    if (activity.subagents > 0)
      l10n.mastermindThreadActivitySubagents(activity.subagents),
  ].join(' · ');
}
