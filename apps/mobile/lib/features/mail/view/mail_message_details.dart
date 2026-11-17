import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_message_delivery.dart';
import 'package:mobile/features/mail/view/mail_reader_identity.dart';
import 'package:mobile/l10n/l10n.dart';

/// Displays supplied provider metadata without inferring hidden recipients.
class MailMessageDetails extends StatelessWidget {
  const MailMessageDetails({
    required this.message,
    this.people = const {},
    super.key,
  });
  final Map<String, dynamic> message;
  final Map<String, Map<String, dynamic>> people;

  static String? _text(Object? value) =>
      value is String && value.trim().isNotEmpty ? value.trim() : null;

  Widget _row(BuildContext context, String label, Widget value) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.md),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: AppTokens.of(context).colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        value,
      ],
    ),
  );

  Widget _person(
    BuildContext context,
    String address,
    String? name,
    Map<String, dynamic>? profile,
  ) {
    final resolved = people[address.trim().toLowerCase()] ?? profile;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MailReaderIdentity(
            address: address,
            name: name,
            profile: resolved,
            compact: true,
            selectableLabel: true,
          ),
          if (resolved?['emailVisible'] != false &&
              address.isNotEmpty &&
              MailReaderIdentity.visibleName(
                    address,
                    name,
                    resolved,
                    context.l10n.mailMember,
                  ) !=
                  address)
            Padding(
              padding: const EdgeInsets.only(left: 34, top: 3),
              child: SelectableText(
                address,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }

  Map<String, dynamic>? _profile(Object? value) =>
      value is Map<String, dynamic> ? value : null;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final recipients = mailRows(message['recipients']);
    final headers = message['safeHeaders'] is Map
        ? message['safeHeaders'] as Map
        : const <String, dynamic>{};
    final sent = mailSentDate(message);
    final received = mailDistinctReceivedDate(message);
    final colors = AppTokens.of(context).colorScheme;
    final from = _text(message['fromAddress']);
    final messageId =
        _text(message['internetMessageId']) ?? _text(headers['message-id']);
    final inReplyTo =
        _text(message['inReplyTo']) ?? _text(headers['in-reply-to']);
    final original = _text(message['observedRecipient']);
    final subject = _text(message['subject']);
    final rawDate = _text(headers['date']);
    final replyTo = mailReplyToPeople(message);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.muted,
        borderRadius: AppTokens.of(context).borderRadiusMd,
        border: Border.all(color: colors.border),
      ),
      child: ExpansionTile(
        key: ValueKey('mail-details-${message['id']}'),
        tilePadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
        childrenPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
        title: Text(l10n.mailMessageDetails),
        dense: true,
        shape: const Border(),
        collapsedShape: const Border(),
        children: [
          if (from != null)
            _row(
              context,
              l10n.mailFrom,
              _person(
                context,
                from,
                _text(message['fromName']),
                _profile(message['fromProfile']),
              ),
            ),
          for (final (kind, label) in [
            ('reply_to', l10n.mailReplyTo),
            ('to', l10n.mailTo),
            ('cc', l10n.mailCc),
            ('bcc', l10n.mailBcc),
          ])
            if (recipients.any((row) => row['kind'] == kind))
              _row(
                context,
                label,
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final row in recipients.where(
                      (row) => row['kind'] == kind,
                    ))
                      _person(
                        context,
                        _text(row['address']) ?? '',
                        _text(row['displayName']),
                        _profile(row['profile']),
                      ),
                  ],
                ),
              ),
          if (!recipients.any((row) => row['kind'] == 'reply_to') &&
              replyTo.isNotEmpty)
            _row(
              context,
              l10n.mailReplyTo,
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final (address, name) in replyTo)
                    _person(context, address, name, null),
                ],
              ),
            ),
          _row(
            context,
            l10n.mailSent,
            SelectableText(
              sent == null
                  ? l10n.mailDateUnavailable
                  : formatMailDeliveryDate(context, sent),
            ),
          ),
          if (received != null)
            _row(
              context,
              l10n.mailReceived,
              SelectableText(formatMailDeliveryDate(context, received)),
            ),
          if (subject != null)
            _row(context, l10n.mailSubject, SelectableText(subject)),
          if (messageId != null)
            _row(context, l10n.mailMessageId, SelectableText(messageId)),
          if (inReplyTo != null)
            _row(context, l10n.mailInReplyTo, SelectableText(inReplyTo)),
          if (original != null)
            _row(
              context,
              l10n.mailOriginalRecipient,
              _person(context, original, null, null),
            ),
          if (rawDate != null)
            ExpansionTile(
              key: ValueKey('mail-technical-headers-${message['id']}'),
              tilePadding: EdgeInsets.zero,
              title: Text(l10n.mailTechnicalHeaders),
              dense: true,
              children: [_row(context, 'Date', SelectableText(rawDate))],
            ),
        ],
      ),
    );
  }
}

/// Shared parsing keeps lookup and displayed raw Reply-to identities in step.
List<(String, String?)> mailReplyToPeople(Map<String, dynamic> message) {
  final headers = message['safeHeaders'];
  final raw = headers is Map ? headers['reply-to'] : null;
  if (raw is! String) return const [];
  return RegExp(
    r'(?:"([^"]*)"|([^<>,]*))\s*<([^<>]+)>|([^\s,<>]+@[^\s,<>]+)',
  ).allMatches(raw).map((match) {
    final name = (match[1] ?? match[2])?.trim();
    return (
      (match[3] ?? match[4]!).trim(),
      name == null || name.isEmpty ? null : name,
    );
  }).toList();
}
