import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_reader_dock_plan.dart';

MailReaderDockPlan _plan({
  bool canSend = true,
  MailPrimaryAction primary = MailPrimaryAction.archive,
  bool quarantined = false,
  bool inTrash = false,
  bool canRestore = false,
  bool unread = false,
  bool snoozed = false,
  bool thread = false,
  bool muted = false,
}) => MailReaderDockPlan.build(
  canSend: canSend,
  primary: primary,
  quarantined: quarantined,
  inTrash: inTrash,
  canRestore: canRestore,
  unread: unread,
  snoozed: snoozed,
  thread: thread,
  muted: muted,
);

List<MailDockMore> _all(MailReaderDockPlan plan) => [
  ...plan.bar,
  ...plan.more.expand((section) => section),
];

void main() {
  test('the default plan: replies on the bar, Archive on the navbar and '
      'Delete alone at the end of More', () {
    final plan = _plan();
    expect(plan.replies, [
      MailDockReply.reply,
      MailDockReply.replyAll,
      MailDockReply.forward,
    ]);
    expect(plan.bar, isEmpty);
    expect(plan.quick, MailQuickAction.archive);
    expect(plan.more, [
      [
        MailDockMore.markUnread,
        MailDockMore.snooze,
        MailDockMore.labels,
        MailDockMore.move,
      ],
      [MailDockMore.appearance, MailDockMore.images, MailDockMore.share],
      [MailDockMore.trash],
    ]);
  });

  test('every command appears in exactly one place', () {
    for (final primary in MailPrimaryAction.values) {
      for (final canRestore in [false, true]) {
        final plan = _plan(primary: primary, canRestore: canRestore);
        final entries = _all(plan);
        expect(entries.toSet().length, entries.length);
        if (plan.quick == MailQuickAction.archive ||
            plan.quick == MailQuickAction.restore) {
          expect(entries, isNot(contains(MailDockMore.archive)));
          expect(entries, isNot(contains(MailDockMore.restore)));
        }
        if (plan.quick == MailQuickAction.trash) {
          expect(entries, isNot(contains(MailDockMore.trash)));
        }
      }
    }
  });

  test('Archive is the default navbar action while Reply stays on the bar', () {
    expect(MailPrimaryAction.values, const [
      MailPrimaryAction.archive,
      MailPrimaryAction.trash,
      MailPrimaryAction.markUnread,
    ]);
    final plan = _plan();
    expect(plan.quick, MailQuickAction.archive);
    expect(plan.replies.first, MailDockReply.reply);
  });

  test('a default of Delete puts Delete on the navbar and Archive in More', () {
    final plan = _plan(primary: MailPrimaryAction.trash);
    expect(plan.quick, MailQuickAction.trash);
    expect(plan.more.first, contains(MailDockMore.archive));
    expect(plan.more.length, 2);
  });

  test('a default of Mark unread follows the read state', () {
    expect(
      _plan(primary: MailPrimaryAction.markUnread).quick,
      MailQuickAction.markUnread,
    );
    expect(
      _plan(primary: MailPrimaryAction.markUnread, unread: true).quick,
      MailQuickAction.markRead,
    );
    expect(
      _all(_plan(primary: MailPrimaryAction.markUnread)),
      isNot(contains(MailDockMore.markUnread)),
    );
  });

  test('archived and trashed mail restores from the navbar', () {
    expect(_plan(canRestore: true).quick, MailQuickAction.restore);
    final trash = _plan(canRestore: true, inTrash: true);
    expect(trash.quick, MailQuickAction.restore);
    expect(_all(trash), isNot(contains(MailDockMore.trash)));
    expect(
      _plan(
        primary: MailPrimaryAction.trash,
        inTrash: true,
        canRestore: true,
      ).quick,
      MailQuickAction.restore,
    );
  });

  test('quarantined mail offers no Archive, Move or Delete', () {
    final plan = _plan(quarantined: true);
    expect(plan.quick, isNull);
    expect(
      _all(plan),
      isNot(
        anyOf(
          contains(MailDockMore.archive),
          contains(MailDockMore.move),
          contains(MailDockMore.trash),
        ),
      ),
    );
  });

  test('state-dependent entries follow the message', () {
    expect(_all(_plan(unread: true)), contains(MailDockMore.markRead));
    expect(_all(_plan(snoozed: true)), contains(MailDockMore.unsnooze));
    expect(_all(_plan()), isNot(contains(MailDockMore.mute)));
    expect(_all(_plan(thread: true)), contains(MailDockMore.mute));
    expect(
      _all(_plan(thread: true, muted: true)),
      contains(MailDockMore.unmute),
    );
  });

  test('a mailbox that cannot send puts its common commands on the bar', () {
    final plan = _plan(canSend: false);
    expect(plan.replies, isEmpty);
    expect(plan.bar, [MailDockMore.markUnread, MailDockMore.snooze]);
    expect(plan.more.first, isNot(contains(MailDockMore.markUnread)));
  });
}
