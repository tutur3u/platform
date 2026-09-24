import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/meet/view/meet_room_message_body.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  testWidgets(
    'participant markdown blocks remote images and reveals link URL',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: MeetRoomMessageBody(
              data:
                  '![secret](https://tracker.example.test/pixel) '
                  '[View notes](https://example.test/review?id=1)',
            ),
          ),
        ),
      );

      expect(find.byType(Image), findsNothing);
      expect(find.text('[secret]'), findsOneWidget);
      await tester.tap(find.textContaining('View notes', findRichText: true));
      await tester.pumpAndSettle();
      expect(find.text('https://example.test/review?id=1'), findsOneWidget);
    },
  );
}
