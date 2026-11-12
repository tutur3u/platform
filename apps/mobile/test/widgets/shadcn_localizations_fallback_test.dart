import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../helpers/pump_app.dart';

void main() {
  test(
    'delegate advertises only app locales and loads their resources',
    () async {
      const delegate = AppShadcnLocalizationsDelegate();
      expect(delegate.isSupported(const Locale('en')), isTrue);
      expect(delegate.isSupported(const Locale('vi')), isTrue);
      expect(delegate.isSupported(const Locale('fr')), isFalse);
      final english = await delegate.load(const Locale('en'));
      final vietnamese = await delegate.load(const Locale('vi'));
      expect(english.formNotEmpty, 'This field cannot be empty');
      expect(vietnamese.formNotEmpty, 'Trường này không được để trống');
      expect(english.placeholderDatePicker, 'Select a date');
      expect(vietnamese.placeholderDatePicker, 'Chọn ngày');
      expect(delegate.shouldReload(delegate), isFalse);
    },
  );
  for (final locale in ['en', 'vi']) {
    testWidgets(
      '$locale actual app bridge keeps app/Material locale and Shad controls usable',
      (tester) async {
        tester.platformDispatcher.localesTestValue = [Locale(locale)];
        addTearDown(tester.platformDispatcher.clearLocalesTestValue);
        Locale? resolved;
        await tester.pumpApp(
          Scaffold(
            body: Builder(
              builder: (context) {
                resolved = Localizations.localeOf(context);
                return Column(
                  children: [
                    Text(context.l10n.profileAvatar),
                    Text(MaterialLocalizations.of(context).pasteButtonLabel),
                    shad.DatePicker(
                      value: null,
                      initialView: shad.CalendarView(2026, 10),
                      onChanged: (_) {},
                    ),
                  ],
                );
              },
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(resolved?.languageCode, locale);
        expect(
          find.text(locale == 'vi' ? 'Ảnh đại diện' : 'Avatar'),
          findsOneWidget,
        );
        expect(find.text(locale == 'vi' ? 'Dán' : 'Paste'), findsOneWidget);
        final datePlaceholder = locale == 'vi' ? 'Chọn ngày' : 'Select a date';
        expect(find.text(datePlaceholder), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.tap(find.text(datePlaceholder));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );
  }
}
