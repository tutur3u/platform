import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_message_details.dart';
import '../../helpers/pump_app.dart';

void main() {
  testWidgets(
    'shows authorized names and addresses without inferred Bcc',
    (tester) async {
      const message = {
        'id': 'message',
        'fromName': 'Linh Trần',
        'fromAddress': 'host@example.test',
        'recipients': [
          {
            'kind': 'to',
            'displayName': 'Phúc Võ Hoàng',
            'address': 'guest@example.test',
          },
          {'kind': 'to', 'address': 'another.very.long.address@example.test'},
          {
            'kind': 'cc',
            'displayName': 'Thanh Phạm',
            'address': 'cc@example.test',
          },
        ],
      };
      await tester.pumpApp(
        const Scaffold(body: MailMessageDetails(message: message)),
      );
      await tester.tap(find.text('Message details'));
      await tester.pumpAndSettle();
      for (final value in [
        'Linh Trần <host@example.test>',
        'Phúc Võ Hoàng <guest@example.test>',
        'another.very.long.address@example.test',
        'Thanh Phạm <cc@example.test>',
      ]) {
        expect(find.text(value), findsOneWidget);
        expect(
          tester
              .widget<SelectableText>(
                find.byWidgetPredicate(
                  (widget) => widget is SelectableText && widget.data == value,
                ),
              )
              .maxLines,
          isNull,
        );
      }
      expect(find.text('Bcc'), findsNothing);
      await tester.longPress(find.text('Phúc Võ Hoàng <guest@example.test>'));
      await tester.pumpAndSettle();
      expect(find.text('Copy'), findsOneWidget);
    },
  );
  testWidgets('only explicit authorized Bcc metadata is displayed', (
    tester,
  ) async {
    await tester.pumpApp(
      const Scaffold(
        body: MailMessageDetails(
          message: {
            'id': 'message',
            'fromAddress': 'host@example.test',
            'recipients': [
              {'kind': 'bcc', 'address': 'authorized@example.test'},
            ],
          },
        ),
      ),
    );
    await tester.tap(find.text('Message details'));
    await tester.pumpAndSettle();
    expect(find.text('Bcc'), findsOneWidget);
    expect(find.text('authorized@example.test'), findsOneWidget);
  });
}
