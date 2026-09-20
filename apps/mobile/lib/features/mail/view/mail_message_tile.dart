import 'package:flutter/material.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class MailMessageTile extends StatelessWidget {
  const MailMessageTile({
    required this.item,
    required this.thread,
    required this.selected,
    required this.onTap,
    required this.onSelect,
    this.loading = false,
    super.key,
  });
  final Map<String, dynamic> item;
  final bool thread;
  final bool selected;
  final bool loading;
  final VoidCallback onTap;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final unread =
        item['unread'] == true || (item['unreadCount'] as int? ?? 0) > 0;
    final subject = item['subject'] as String?;
    final sender = thread
        ? mailRows(
            item['participants'],
          ).map((p) => p['displayName'] ?? p['address']).join(', ')
        : (item['fromName'] ?? item['fromAddress']) as String? ?? '';
    final date = mailMessageDate(item, thread: thread);
    return Semantics(
      selected: selected,
      child: Material(
        color: selected
            ? colors.primary.withValues(alpha: 0.08)
            : colors.surfaceContainerLowest,
        child: InkWell(
          onTap: loading ? null : onTap,
          onLongPress: onSelect,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 16, 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 20,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: loading
                        ? const SizedBox(
                            width: 12,
                            height: 12,
                            child: NovaLoadingIndicator(size: 20),
                          )
                        : selected
                        ? Icon(
                            Icons.check_circle,
                            size: 16,
                            color: colors.primary,
                          )
                        : Icon(
                            Icons.circle,
                            size: 7,
                            color: unread ? colors.primary : Colors.transparent,
                          ),
                  ),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              sender,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: unread
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                          ),
                          if (date != null) ...[
                            const SizedBox(width: 8),
                            Text(
                              formatMailMessageDate(
                                context,
                                date,
                                compact: true,
                              ),
                              style: TextStyle(
                                fontSize: 12,
                                color: colors.onSurfaceVariant,
                              ),
                            ),
                          ],
                          if (item['starred'] == true) ...[
                            const SizedBox(width: 4),
                            Icon(
                              Icons.star_rounded,
                              size: 14,
                              color: colors.primary,
                            ),
                          ],
                          if (item['hasAttachments'] == true) ...[
                            const SizedBox(width: 4),
                            Icon(
                              Icons.attach_file,
                              size: 13,
                              color: colors.onSurfaceVariant,
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        subject?.isNotEmpty == true
                            ? subject!
                            : context.l10n.mailNoSubject,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: unread
                              ? FontWeight.w600
                              : FontWeight.w400,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        (item[thread ? 'latestSnippet' : 'snippet']
                                as String?) ??
                            '',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          height: 1.35,
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                      if (item['deliveryRecipient'] != null)
                        Text(
                          item['deliveryRecipient'] as String,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: colors.onSurfaceVariant,
                          ),
                        ),
                      if (mailRows(item['labels']).isNotEmpty)
                        Text(
                          mailRows(
                            item['labels'],
                          ).map((label) => label['name']).join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: colors.primary),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
