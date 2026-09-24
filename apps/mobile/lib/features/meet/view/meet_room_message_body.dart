import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:url_launcher/url_launcher.dart';

/// Room messages are participant authored, so remote images stay blocked and
/// link destinations are shown before opening another app.
class MeetRoomMessageBody extends StatelessWidget {
  const MeetRoomMessageBody({required this.data, super.key});

  final String data;

  @override
  Widget build(BuildContext context) => MarkdownBody(
    data: data,
    selectable: true,
    imageBuilder: (uri, title, alt) => Text(
      alt?.trim().isNotEmpty == true ? '[${alt!.trim()}]' : '[image]',
      style: Theme.of(context).textTheme.bodySmall,
    ),
    onTapLink: (text, href, title) {
      if (href == null) return;
      unawaited(_confirmOpen(context, href));
    },
    styleSheet: assistantMarkdownStyle(Theme.of(context), subdued: false),
  );
}

Future<void> _confirmOpen(BuildContext context, String href) async {
  final uri = Uri.tryParse(href.trim());
  if (uri == null || !{'https', 'http', 'mailto'}.contains(uri.scheme)) return;
  final approved = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(dialogContext.l10n.meetOpenLink),
      content: SelectableText(uri.toString()),
      actions: [
        TextButton.icon(
          onPressed: () => Navigator.pop(dialogContext, false),
          icon: const Icon(Icons.close),
          label: Text(dialogContext.l10n.commonCancel),
        ),
        FilledButton.icon(
          onPressed: () => Navigator.pop(dialogContext, true),
          icon: const Icon(Icons.open_in_new),
          label: Text(dialogContext.l10n.meetOpenLink),
        ),
      ],
    ),
  );
  if (approved == true && context.mounted) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
