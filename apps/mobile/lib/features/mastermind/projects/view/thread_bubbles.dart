import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// A conversation bubble or a collapsed, typed activity entry.
class ThreadMessageBubble extends StatelessWidget {
  const ThreadMessageBubble({required this.message, super.key});

  final ThreadMessage message;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final details = [
      if (message.text.isNotEmpty) ThreadMarkdown(message.text),
      if (message.activityStatus case final status?)
        Text(switch (status) {
          FleetActivityStatus.idle => l10n.mastermindTranscriptIdle,
          FleetActivityStatus.pending => l10n.mastermindTranscriptPending,
          FleetActivityStatus.running => l10n.mastermindTranscriptRunning,
          FleetActivityStatus.waiting => l10n.mastermindTranscriptWaiting,
          FleetActivityStatus.completed => l10n.mastermindTranscriptCompleted,
          FleetActivityStatus.failed => l10n.mastermindTranscriptFailed,
          FleetActivityStatus.cancelled => l10n.mastermindTranscriptCancelled,
          FleetActivityStatus.interrupted =>
            l10n.mastermindTranscriptInterrupted,
        }),
      if (message.truncated)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: ThreadMutedText(
            l10n.mastermindProjectsTruncated,
            italic: true,
          ),
        ),
    ];
    final label = switch (message.kind) {
      FleetTranscriptKind.interAgent => l10n.mastermindTranscriptInterAgent,
      FleetTranscriptKind.delegatedTask => l10n.mastermindTranscriptDelegated,
      FleetTranscriptKind.operation => l10n.mastermindTranscriptOperation,
      _ => null,
    };
    if (label != null) {
      final storage = PageStorage.maybeOf(context);
      final identity = (
        'mastermind-activity',
        message.identity ?? message.position,
      );
      return AppDisclosure(
        title: Row(
          children: [
            Expanded(child: Text(label)),
            ThreadMutedText(
              TimeOfDay.fromDateTime(message.at.toLocal()).format(context),
            ),
          ],
        ),
        initiallyExpanded:
            storage?.readState(context, identifier: identity) == true,
        onExpansionChanged: (expanded) =>
            storage?.writeState(context, expanded, identifier: identity),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        childrenPadding: const EdgeInsets.all(AppSpacing.md),
        children: details,
      );
    }
    return ThreadBubbleFrame(
      user: message.role == ThreadMessageRole.user,
      time: message.at,
      children: details,
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

/// Selectable transcript text with no remote image requests.
class ThreadMarkdown extends StatelessWidget {
  const ThreadMarkdown(this.text, {super.key});

  final String text;
  static final _markerSyntax = _RedactedMarkerSyntax();
  static final _redactedLink = RegExp(
    r'(?:\[|%5b)redacted(?:\]|%5d)',
    caseSensitive: false,
  );

  @override
  Widget build(BuildContext context) => MarkdownBody(
    data: text,
    selectable: true,
    inlineSyntaxes: [_markerSyntax],
    softLineBreak: true,
    imageBuilder: (_, _, alt) => Text(alt ?? ''),
    onTapLink: (_, href, _) {
      if (href == null || _redactedLink.hasMatch(href)) return;
      final uri = Uri.tryParse(href);
      if (uri == null ||
          (uri.scheme != 'https' && uri.scheme != 'http') ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty) {
        return;
      }
      unawaited(openMobileLink(context, uri));
    },
  );
}

/// A redaction marker is literal even if the message defines a Markdown
/// reference link with the same label.
class _RedactedMarkerSyntax extends md.InlineSyntax {
  _RedactedMarkerSyntax() : super(r'\[redacted\]', startCharacter: 0x5b);

  @override
  bool onMatch(md.InlineParser parser, Match match) {
    parser.addNode(md.Text(match[0]!));
    return true;
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
