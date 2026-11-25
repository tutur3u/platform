import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_action_bar.dart';

import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

void main() {
  for (final (size, sidebar, textScale) in [
    (const Size(320, 720), 0.0, 1.0),
    (const Size(740, 900), 0.0, 1.0),
    (const Size(1500, 920), 240.0, 1.0),
    (const Size(1500, 920), 240.0, 1.5),
  ]) {
    testWidgets('confirmation fits width ${size.width} at scale $textScale', (
      tester,
    ) async {
      setMailSurface(tester, size);
      var undone = false;
      await tester.pumpApp(
        Builder(
          builder: (context) => Padding(
            padding: EdgeInsets.only(left: sidebar),
            child: MediaQuery(
              data: MediaQuery.of(context).copyWith(
                padding: const EdgeInsets.only(bottom: 24),
                textScaler: TextScaler.linear(textScale),
              ),
              child: Align(
                alignment: Alignment.bottomCenter,
                child: MailActionBar(
                  label: 'Archived',
                  liveRegion: true,
                  children: [
                    const Text('Archived', softWrap: false),
                    MailBarButton(
                      icon: Icons.undo,
                      label: 'Undo',
                      onPressed: () => undone = true,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final bar = find.descendant(
        of: find.byType(MailActionBar),
        matching: find.byType(Material),
      );
      final surface = tester.getRect(bar.first);
      final message = tester.getRect(find.text('Archived'));
      final undo = tester.getRect(find.text('Undo'));
      expect(surface.width, inInclusiveRange(144, 640));
      expect(surface.left, greaterThan(sidebar));
      expect(surface.bottom, closeTo(size.height - 36, 1));
      expect(message.right, lessThan(undo.left));
      expect(surface.contains(undo.bottomRight), isTrue);
      expect(message.center.dy, closeTo(undo.center.dy, 3));
      await tester.tap(find.text('Undo'));
      expect(undone, isTrue);
      expect(tester.takeException(), isNull);
    });
  }
}
