import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';

/// Reply entries shown directly on the floating dock.
enum MailDockReply { reply, replyAll, forward }

/// Entries of the More sheet, in display order.
enum MailDockMore {
  inbox,
  appearance,
  images,
  star,
  unstar,
  markRead,
  markUnread,
  snooze,
  unsnooze,
  labels,
  archive,
  restore,
  move,
  trash,
}

/// What the reader registers on the floating dock and its More sheet.
///
/// The primary circle owns whatever the user's preference selects, so the same
/// command is never repeated in the pill or the sheet.
class MailReaderDockPlan {
  const MailReaderDockPlan({required this.replies, required this.more});

  factory MailReaderDockPlan.build({
    required bool canSend,
    required MailPrimaryAction primary,
    required bool quarantined,
    required bool inTrash,
    required bool canRestore,
    required bool starred,
    required bool unread,
    bool snoozed = false,
  }) {
    final circleReply = primary == MailPrimaryAction.reply;
    final circleArchive = primary == MailPrimaryAction.archive;
    final circleMarkUnread = primary == MailPrimaryAction.markUnread;
    final circleTrash = primary == MailPrimaryAction.trash;
    return MailReaderDockPlan(
      replies: [
        if (canSend) ...[
          if (!circleReply) MailDockReply.reply,
          MailDockReply.replyAll,
          MailDockReply.forward,
        ],
      ],
      more: [
        MailDockMore.inbox,
        MailDockMore.appearance,
        MailDockMore.images,
        if (starred) MailDockMore.unstar else MailDockMore.star,
        if (unread)
          MailDockMore.markRead
        else if (!circleMarkUnread)
          MailDockMore.markUnread,
        if (snoozed) MailDockMore.unsnooze else MailDockMore.snooze,
        MailDockMore.labels,
        if (!quarantined && !circleArchive)
          if (canRestore) MailDockMore.restore else MailDockMore.archive,
        if (!quarantined) MailDockMore.move,
        if (!quarantined && !inTrash && !circleTrash) MailDockMore.trash,
      ],
    );
  }

  final List<MailDockReply> replies;
  final List<MailDockMore> more;
}
