import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_post_call_view.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  for (final locale in ['en', 'vi']) {
    testWidgets('ended Live shows explicit actions and transcript $locale', (
      tester,
    ) async {
      tester.view
        ..physicalSize = const Size(320, 720)
        ..devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      var calls = 0;
      final starting = Completer<void>();
      await tester.pumpWidget(
        MaterialApp(
          locale: Locale(locale),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: Scaffold(
                body: AssistantLivePostCallView(
                  onCall: () async {
                    calls++;
                    await starting.future;
                  },
                  transcript: const Text('Synthetic retained transcript'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(calls, 0);
      final viewLabel = locale == 'en' ? 'View transcript' : 'Xem bản ghi';
      await tester.tap(find.text(viewLabel));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic retained transcript'), findsOneWidget);
      final callLabel = locale == 'en' ? 'Call again' : 'Gọi lại';
      await tester.tap(find.text(callLabel));
      await tester.pump();
      expect(calls, 1);
      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
      starting.complete();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
