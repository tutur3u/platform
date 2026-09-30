import 'package:flutter/material.dart';
import 'package:mobile/features/mail/models/mail_calendar_link_preview.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:url_launcher/url_launcher.dart';

class MailCalendarLinkDetails extends StatelessWidget {
  const MailCalendarLinkDetails({
    required this.preview,
    required this.busy,
    required this.onConfirm,
    required this.onCancel,
    super.key,
  });
  final MailCalendarLinkPreview preview;
  final bool busy;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final authority = preview.target['authority'] as Map?;
    final attendees = authority?['attendees'] as List? ?? const [];
    final timeZone = authority?['timeZone'] as String?;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.mailCalendarLinkOriginal),
            Text(
              '${preview.original['summary']} · ${preview.original['when']}',
            ),
            Text(
              '${preview.invitation['organizer']} → '
              '${preview.invitation['attendee']}',
            ),
            SelectableText(preview.original['location'] as String),
            if (preview.original['joinUrl'] is String)
              TextButton(
                onPressed: () => launchUrl(
                  Uri.parse(preview.original['joinUrl'] as String),
                  mode: LaunchMode.externalApplication,
                ),
                child: Text(l.mailInvitationJoin),
              ),
            Text(l.mailCalendarLinkSelected),
            Text(
              '${preview.target['title']} · ${preview.target['accountLabel']}',
            ),
            Text('${preview.target['start']} – ${preview.target['end']}'),
            Text('${preview.target['organizer'] ?? ''}'),
            if (timeZone != null) Text(timeZone),
            for (final person in attendees.whereType<Map<String, dynamic>>())
              Text(
                [person['name'], person['email'], person['responseStatus']]
                    .whereType<String>()
                    .where((value) => value.isNotEmpty)
                    .join(' · '),
              ),
            SelectableText(preview.target['location'] as String),
            if (preview.target['joinUrl'] is String)
              TextButton(
                onPressed: () => launchUrl(
                  Uri.parse(preview.target['joinUrl'] as String),
                  mode: LaunchMode.externalApplication,
                ),
                child: Text(l.mailInvitationJoin),
              ),
            Wrap(
              spacing: 8,
              children: [
                FilledButton(
                  onPressed: busy ? null : onConfirm,
                  child: Text(l.mailCalendarLinkConfirm),
                ),
                TextButton(
                  onPressed: busy ? null : onCancel,
                  child: Text(l.commonCancel),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
