import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';
import 'package:mobile/features/mastermind/threads/history/thread_text.dart';
import 'package:mobile/l10n/l10n.dart';

/// One feed message, adapted from #7182's thread tile: plain text only (no
/// Markdown, links, images or remote loads), bidi and invisible characters
/// stripped, and redactions as neutral placeholders. A withheld message reads
/// "Hidden message" rather than leaving a gap.
///
/// The author line is display-only provenance; nothing derives authority from
/// it.
class IrisMessageTile extends StatelessWidget {
  const IrisMessageTile({required this.message, super.key});

  final ThreadMessage message;

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
    final activity = irisActivityText(l10n, message.activity);
    return Padding(
      key: ValueKey('iris-message-${message.ref}'),
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
                irisAuthorText(l10n, message),
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
            Text(
              l10n.mastermindIrisHidden,
              style: muted.copyWith(fontStyle: FontStyle.italic),
            )
          else if (message.text.isNotEmpty)
            Text.rich(
              TextSpan(
                style: body,
                children: [
                  for (final run in threadTextRuns(message.text))
                    switch (run) {
                      PlainRun(:final text) => TextSpan(text: text),
                      final RedactionRun redaction => TextSpan(
                        text: '‹${irisRedactionText(l10n, redaction)}›',
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
            Text(l10n.mastermindIrisTruncated, style: muted),
          ],
        ],
      ),
    );
  }
}

/// The relay's own label ("Owner", "Atlas", "Iris") when it sent one.
String irisAuthorText(AppLocalizations l10n, ThreadMessage message) {
  final label = message.authorLabel.trim();
  if (label.isNotEmpty) return label;
  return switch (message.author) {
    ThreadAuthor.ownerMac ||
    ThreadAuthor.ownerPhone => l10n.mastermindIrisAuthorOwner,
    ThreadAuthor.agent => l10n.mastermindIrisAuthorAgent,
    ThreadAuthor.system => l10n.mastermindIrisAuthorSystem,
  };
}

String irisRedactionText(AppLocalizations l10n, RedactionRun run) =>
    switch (run.kind) {
      RedactionKind.path => l10n.mastermindIrisRedactedPath,
      RedactionKind.link => switch (run.host) {
        final host? => l10n.mastermindIrisRedactedLinkHost(host),
        null => l10n.mastermindIrisRedactedLink,
      },
      RedactionKind.secret => l10n.mastermindIrisRedactedSecret,
      RedactionKind.id => l10n.mastermindIrisRedactedId,
      RedactionKind.email => l10n.mastermindIrisRedactedEmail,
      RedactionKind.number => l10n.mastermindIrisRedactedNumber,
      RedactionKind.other => l10n.mastermindIrisRedactedOther,
    };

/// "Ran 4 commands · Edited 2 files": a summary only, never expandable.
String? irisActivityText(AppLocalizations l10n, ThreadActivity? activity) {
  if (activity == null || activity.isEmpty) return null;
  return [
    if (activity.commands > 0)
      l10n.mastermindIrisActivityCommands(activity.commands),
    if (activity.edits > 0) l10n.mastermindIrisActivityEdits(activity.edits),
    if (activity.searches > 0)
      l10n.mastermindIrisActivitySearches(activity.searches),
    if (activity.subagents > 0)
      l10n.mastermindIrisActivitySubagents(activity.subagents),
  ].join(' · ');
}
