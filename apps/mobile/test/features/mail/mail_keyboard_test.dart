import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_keyboard.dart';

void main() {
  test('mail commands map to their ordinary keys', () {
    final commands = {
      LogicalKeyboardKey.keyJ: MailKeyboardCommand.next,
      LogicalKeyboardKey.keyK: MailKeyboardCommand.previous,
      LogicalKeyboardKey.enter: MailKeyboardCommand.open,
      LogicalKeyboardKey.keyE: MailKeyboardCommand.archive,
      LogicalKeyboardKey.keyR: MailKeyboardCommand.reply,
      LogicalKeyboardKey.keyA: MailKeyboardCommand.replyAll,
      LogicalKeyboardKey.keyF: MailKeyboardCommand.forward,
      LogicalKeyboardKey.keyU: MailKeyboardCommand.unread,
      LogicalKeyboardKey.keyS: MailKeyboardCommand.star,
      LogicalKeyboardKey.keyC: MailKeyboardCommand.compose,
      LogicalKeyboardKey.slash: MailKeyboardCommand.search,
      LogicalKeyboardKey.escape: MailKeyboardCommand.back,
    };
    for (final entry in commands.entries) {
      expect(mailKeyboardCommand(entry.key), entry.value);
    }
    expect(
      mailKeyboardCommand(
        LogicalKeyboardKey.digit3,
        character: '#',
        shift: true,
      ),
      MailKeyboardCommand.trash,
    );
    expect(
      mailKeyboardCommand(
        LogicalKeyboardKey.slash,
        character: '?',
        shift: true,
      ),
      MailKeyboardCommand.help,
    );
    expect(
      mailKeyboardCommand(
        LogicalKeyboardKey.digit3,
        character: '£',
        shift: true,
      ),
      isNull,
    );
  });

  test('mail preserves modified app-wide and system shortcuts', () {
    for (final key in [
      LogicalKeyboardKey.keyK,
      LogicalKeyboardKey.keyN,
      LogicalKeyboardKey.digit1,
      LogicalKeyboardKey.slash,
      LogicalKeyboardKey.comma,
    ]) {
      expect(mailKeyboardCommand(key, meta: true), isNull);
      expect(mailKeyboardCommand(key, control: true), isNull);
      expect(mailKeyboardCommand(key, alt: true), isNull);
    }
  });
}
