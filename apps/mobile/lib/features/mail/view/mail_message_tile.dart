import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/l10n/l10n.dart';

class MailMessageTile extends StatelessWidget {
  const MailMessageTile({
    required this.item,
    required this.thread,
    required this.selected,
    required this.onTap,
    required this.onSelect,
    super.key,
  });
  final Map<String, dynamic> item;
  final bool thread;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    final unread =
        item['unread'] == true || (item['unreadCount'] as int? ?? 0) > 0;
    final subject = item['subject'] as String?;
    final sender = thread
        ? mailRows(
            item['participants'],
          ).map((p) => p['displayName'] ?? p['address']).join(', ')
        : (item['fromName'] ?? item['fromAddress']) as String? ?? '';
    final date = DateTime.tryParse(
      (item['lastMessageAt'] ??
                  item['sentAt'] ??
                  item['receivedAt'] ??
                  item['createdAt'])
              as String? ??
          '',
    )?.toLocal();
    return ListTile(
      selected: selected,
      onTap: onTap,
      onLongPress: onSelect,
      leading: IconButton(
        tooltip: context.l10n.mailSelectAll,
        onPressed: onSelect,
        icon: Icon(
          selected
              ? Icons.check_circle
              : item['starred'] == true
              ? Icons.star
              : Icons.mail_outline,
        ),
      ),
      title: Text(
        subject?.isNotEmpty == true ? subject! : context.l10n.mailNoSubject,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontWeight: unread ? FontWeight.bold : FontWeight.normal,
        ),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(sender, maxLines: 1, overflow: TextOverflow.ellipsis),
          if (date != null)
            Text(
              DateFormat.yMd(
                Localizations.localeOf(context).languageCode,
              ).add_jm().format(date),
            ),
          Text(
            (item[thread ? 'latestSnippet' : 'snippet'] as String?) ?? '',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (item['deliveryRecipient'] != null)
            Text(
              item['deliveryRecipient'] as String,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          if (mailRows(item['labels']).isNotEmpty)
            Text(
              mailRows(item['labels']).map((label) => label['name']).join(', '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
        ],
      ),
      trailing: item['hasAttachments'] == true
          ? const Icon(Icons.attach_file)
          : null,
    );
  }
}
