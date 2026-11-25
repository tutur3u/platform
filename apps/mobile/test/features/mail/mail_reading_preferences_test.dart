import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_appearance_control.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_reading_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  String? next(
    MailAfterArchive choice,
    String current, {
    List<String> order = const ['first', 'second', 'third'],
    Set<String> remaining = const {'first', 'second', 'third'},
  }) => mailConversationAfterAction(
    preference: choice,
    order: order,
    current: current,
    remaining: remaining,
  );

  test('advance follows the next available row and skips removed rows', () {
    expect(next(MailAfterArchive.next, 'first'), 'second');
    expect(
      next(MailAfterArchive.next, 'first', remaining: {'third'}),
      'third',
    );
    expect(next(MailAfterArchive.next, 'third'), 'second');
  });

  test('list mode and an exhausted or unrelated list have no successor', () {
    expect(next(MailAfterArchive.list, 'first'), isNull);
    expect(next(MailAfterArchive.next, 'first', remaining: {}), isNull);
    expect(next(MailAfterArchive.next, 'first', order: []), isNull);
    expect(next(MailAfterArchive.next, 'notification'), isNull);
  });

  test('reading preferences persist across instances', () async {
    SharedPreferences.setMockInitialValues({});
    final settings = MailReadingPreferences();
    final restored = MailReadingPreferences();
    addTearDown(settings.dispose);
    addTearDown(restored.dispose);
    await settings.load();
    expect(settings.afterArchive, MailAfterArchive.next);
    expect(settings.keyboardEnabled, isTrue);
    await settings.setAfterArchive(MailAfterArchive.list);
    await settings.setKeyboardEnabled(false);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(MailReadingPreferences.afterArchiveKey), 'list');
    expect(prefs.getBool(MailReadingPreferences.keyboardKey), isFalse);
    await restored.load();
    expect(restored.afterArchive, MailAfterArchive.list);
    expect(restored.keyboardEnabled, isFalse);
  });

  test('appearance persists app theme and honors saved modes', () async {
    SharedPreferences.setMockInitialValues({
      MailAppearancePreference.storageKey: 'light',
    });
    final settings = MailAppearancePreference();
    addTearDown(settings.dispose);
    await settings.load();
    expect(settings.value, MailMessageAppearance.light);

    await settings.selectMode('dark');
    final dark = MailAppearancePreference();
    addTearDown(dark.dispose);
    await dark.load();
    expect(dark.value, MailMessageAppearance.dark);

    await settings.selectMode('auto');
    final auto = MailAppearancePreference();
    addTearDown(auto.dispose);
    await auto.load();
    expect(auto.value, isNull);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(MailAppearancePreference.storageKey), 'auto');
  });
}
