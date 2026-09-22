import 'package:flutter_test/flutter_test.dart';
import 'package:html/parser.dart';
import 'package:mobile/features/mail/view/mail_appearance_control.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  for (final appearance in MailMessageAppearance.values) {
    for (final images in [false, true]) {
      test(
        '$appearance keeps image consent and executable isolation: $images',
        () {
          final document = parse(
            buildMailHtmlDocument(
              '<p style="color:red">Hello</p><script>unsafe()</script>',
              loadImages: images,
              appearance: appearance,
            ),
          );
          expect(document.querySelectorAll('script'), isEmpty);
          expect(
            document.body!.attributes['data-mail-preview'],
            appearance.name,
          );
          final csp = document
              .querySelector('meta[http-equiv="Content-Security-Policy"]')!
              .attributes['content']!;
          expect(csp, contains("script-src 'none'"));
          expect(csp, contains("connect-src 'none'"));
          expect(
            csp,
            contains(images ? 'img-src https: data:' : 'img-src data:'),
          );
          expect(
            document
                .querySelector('meta[name="color-scheme"]')!
                .attributes['content'],
            appearance == MailMessageAppearance.dark ? 'dark' : 'light',
          );
          final styles = document
              .querySelectorAll('style')
              .map((e) => e.text)
              .join();
          expect(
            styles.contains('background-color:transparent!important'),
            appearance != MailMessageAppearance.original,
          );
          expect(
            document.querySelector('p')!.attributes['style'],
            appearance == MailMessageAppearance.original
                ? equals('color:red')
                : contains('background:transparent!important'),
          );
        },
      );
    }
  }

  test(
    'appearance survives reopening and ignores unknown saved modes',
    () async {
      SharedPreferences.setMockInitialValues({
        MailAppearancePreference.storageKey: 'invalid',
      });
      final first = MailAppearancePreference();
      await first.load();
      expect(first.value, isNull);
      await first.select(MailMessageAppearance.original);
      first.dispose();
      final reopened = MailAppearancePreference();
      await reopened.load();
      expect(reopened.value, MailMessageAppearance.original);
      reopened.dispose();
    },
  );

  test('late initial preference load cannot replace a user choice', () async {
    SharedPreferences.setMockInitialValues({
      MailAppearancePreference.storageKey: 'original',
    });
    final preference = MailAppearancePreference();
    final loading = preference.load();
    await preference.select(MailMessageAppearance.dark);
    await loading;
    expect(preference.value, MailMessageAppearance.dark);
    preference.dispose();
  });
}
