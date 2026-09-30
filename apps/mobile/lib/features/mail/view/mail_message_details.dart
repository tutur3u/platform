import 'package:flutter/material.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/l10n/l10n.dart';

/// Display only provider-authorized metadata; never derive hidden recipients.
class MailMessageDetails extends StatelessWidget {
  const MailMessageDetails({required this.message, super.key});
  final Map<String, dynamic> message;

  String _address(Map<String, dynamic> row, String addressKey, String nameKey) {
    final address = row[addressKey] as String? ?? '';
    final name = (row[nameKey] as String?)?.trim() ?? '';
    return name.isEmpty || name == address ? address : '$name <$address>';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final recipients = mailRows(message['recipients']);
    final rows = <(String, List<String>)>[
      (l10n.mailSender, [_address(message, 'fromAddress', 'fromName')]),
      for (final kind in ['to', 'cc', 'bcc'])
        (
          switch (kind) {
            'to' => l10n.mailTo,
            'cc' => l10n.mailCc,
            _ => l10n.mailBcc,
          },
          recipients
              .where((row) => row['kind'] == kind)
              .map((row) => _address(row, 'address', 'displayName'))
              .toList(),
        ),
    ];
    return ExpansionTile(
      key: ValueKey('mail-details-${message['id']}'),
      tilePadding: EdgeInsets.zero,
      title: Text(l10n.mailMessageDetails),
      dense: true,
      children: [
        for (final (label, values) in rows)
          if (values.any((value) => value.isNotEmpty))
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(label, style: Theme.of(context).textTheme.labelMedium),
                  for (final value in values.where((value) => value.isNotEmpty))
                    // Native selection offers accessible copy.
                    SelectableText(value),
                ],
              ),
            ),
      ],
    );
  }
}
