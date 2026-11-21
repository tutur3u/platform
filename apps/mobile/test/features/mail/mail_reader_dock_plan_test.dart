import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_reader_dock_plan.dart';

MailReaderDockPlan _plan({
  bool canSend = true,
  MailPrimaryAction primary = MailPrimaryAction.archive,
  bool quarantined = false,
  bool inTrash = false,
  bool canRestore = false,
  bool starred = false,
  bool unread = false,
  bool snoozed = false,
}) => MailReaderDockPlan.build(
  canSend: canSend,
  primary: primary,
  quarantined: quarantined,
  inTrash: inTrash,
  canRestore: canRestore,
  starred: starred,
  unread: unread,
  snoozed: snoozed,
);

void main() {
  test('default plan matches the approved dock and omits Archive', () {
    final plan = _plan();
    expect(plan.replies, [
      MailDockReply.reply,
      MailDockReply.replyAll,
      MailDockReply.forward,
    ]);
    expect(plan.more, [
      MailDockMore.inbox,
      MailDockMore.appearance,
      MailDockMore.images,
      MailDockMore.star,
      MailDockMore.markUnread,
      MailDockMore.snooze,
      MailDockMore.labels,
      MailDockMore.move,
      MailDockMore.trash,
    ]);
  });

  test('a snoozed message offers Move to Inbox now instead of Snooze', () {
    final more = _plan(snoozed: true).more;
    expect(more, contains(MailDockMore.unsnooze));
    expect(more, isNot(contains(MailDockMore.snooze)));
  });

  test('read-only mailboxes offer More without reply entries', () {
    expect(_plan(canSend: false).replies, isEmpty);
  });

  test('the circle set to Reply drops the pill Reply slot', () {
    expect(_plan(primary: MailPrimaryAction.reply).replies, [
      MailDockReply.replyAll,
      MailDockReply.forward,
    ]);
    expect(
      _plan(primary: MailPrimaryAction.reply).more,
      contains(MailDockMore.archive),
    );
  });

  test('sheet labels follow message state', () {
    final more = _plan(starred: true, unread: true).more;
    expect(more, contains(MailDockMore.unstar));
    expect(more, contains(MailDockMore.markRead));
    expect(more, isNot(contains(MailDockMore.star)));
    expect(more, isNot(contains(MailDockMore.markUnread)));
  });

  test('whatever the circle holds is left out of the sheet', () {
    expect(
      _plan(primary: MailPrimaryAction.trash).more,
      isNot(contains(MailDockMore.trash)),
    );
    expect(
      _plan(primary: MailPrimaryAction.markUnread).more,
      isNot(contains(MailDockMore.markUnread)),
    );
    expect(
      _plan(canRestore: true, primary: MailPrimaryAction.reply).more,
      contains(MailDockMore.restore),
    );
  });

  test(
    'an unread message keeps Mark read even when the circle marks unread',
    () {
      expect(
        _plan(primary: MailPrimaryAction.markUnread, unread: true).more,
        contains(MailDockMore.markRead),
      );
    },
  );

  test('quarantined and trashed messages hide unsafe destinations', () {
    final quarantined = _plan(
      quarantined: true,
      primary: MailPrimaryAction.reply,
    ).more;
    expect(quarantined, isNot(contains(MailDockMore.archive)));
    expect(quarantined, isNot(contains(MailDockMore.move)));
    expect(quarantined, isNot(contains(MailDockMore.trash)));
    expect(_plan(inTrash: true).more, isNot(contains(MailDockMore.trash)));
  });
}
