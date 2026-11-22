import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';

/// Reply entries on the reader's action bar.
enum MailDockReply { reply, replyAll, forward }

/// The one-tap command beside the title: the user's default email action.
enum MailQuickAction { archive, restore, trash, markRead, markUnread }

/// Entries of the More sheet (and of a read-only mailbox's bar).
enum MailDockMore {
  markRead,
  markUnread,
  snooze,
  unsnooze,
  mute,
  unmute,
  labels,
  archive,
  restore,
  move,
  appearance,
  images,
  share,
  trash,
}

/// What the reader registers: replies fill one action bar beside the
/// shell's Back, the default action sits on the top navbar, and everything
/// else lives in a three-section More sheet with Delete last.
///
/// A command appears in exactly one place.
class MailReaderDockPlan {
  const MailReaderDockPlan({
    required this.replies,
    required this.bar,
    required this.quick,
    required this.more,
  });

  factory MailReaderDockPlan.build({
    required bool canSend,
    required MailPrimaryAction primary,
    required bool quarantined,
    required bool inTrash,
    required bool canRestore,
    required bool unread,
    bool snoozed = false,
    bool thread = false,
    bool muted = false,
  }) {
    MailQuickAction? archiveOrRestore() => quarantined
        ? null
        : canRestore
        ? MailQuickAction.restore
        : MailQuickAction.archive;
    final quick = switch (primary) {
      MailPrimaryAction.trash when !quarantined && !inTrash =>
        MailQuickAction.trash,
      MailPrimaryAction.markUnread =>
        unread ? MailQuickAction.markRead : MailQuickAction.markUnread,
      // Delete is unavailable here (Trash, quarantine): fall back.
      MailPrimaryAction.archive ||
      MailPrimaryAction.trash => archiveOrRestore(),
    };
    final quickRead =
        quick == MailQuickAction.markRead ||
        quick == MailQuickAction.markUnread;
    final quickArchive =
        quick == MailQuickAction.archive || quick == MailQuickAction.restore;
    final message = [
      if (!quickRead)
        if (unread) MailDockMore.markRead else MailDockMore.markUnread,
      if (snoozed) MailDockMore.unsnooze else MailDockMore.snooze,
      if (thread)
        if (muted) MailDockMore.unmute else MailDockMore.mute,
      MailDockMore.labels,
      if (!quarantined && !quickArchive)
        if (canRestore) MailDockMore.restore else MailDockMore.archive,
      if (!quarantined) MailDockMore.move,
    ];
    // A mailbox that cannot send has no replies, so its most common
    // commands take the bar instead of hiding behind More.
    final bar = canSend ? const <MailDockMore>[] : message.take(2).toList();
    return MailReaderDockPlan(
      replies: canSend
          ? const [
              MailDockReply.reply,
              MailDockReply.replyAll,
              MailDockReply.forward,
            ]
          : const [],
      bar: bar,
      quick: quick,
      more: [
        message.skip(bar.length).toList(),
        const [
          MailDockMore.appearance,
          MailDockMore.images,
          MailDockMore.share,
        ],
        if (!quarantined && !inTrash && quick != MailQuickAction.trash)
          const [MailDockMore.trash],
      ],
    );
  }

  final List<MailDockReply> replies;

  /// More entries promoted onto the bar when there are no replies.
  final List<MailDockMore> bar;
  final MailQuickAction? quick;

  /// More sheet sections in order: message, view, then Delete.
  final List<List<MailDockMore>> more;
}
