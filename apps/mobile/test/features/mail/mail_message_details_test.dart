import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_message_details.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('shows authorized names and addresses without inferred Bcc', (
    tester,
  ) async {
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
    await tester.pumpAndSettle();
    for (final value in [
      'host@example.test',
      'guest@example.test',
      'another.very.long.address@example.test',
      'cc@example.test',
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
    await tester.longPress(find.text('guest@example.test'));
    await tester.pumpAndSettle();
    expect(find.text('Copy'), findsOneWidget);
  });
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
    await tester.pumpAndSettle();
    expect(find.text('Bcc'), findsOneWidget);
    expect(find.text('authorized@example.test'), findsOneWidget);
  });

  Widget harness(
    Map<String, dynamic> message, {
    Map<String, Map<String, dynamic>> people = const {},
  }) => MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(
      body: SingleChildScrollView(
        child: MailMessageDetails(message: message, people: people),
      ),
    ),
  );

  testWidgets(
    'details disclose authorized fields and keep raw date collapsed',
    (tester) async {
      await tester.pumpWidget(
        harness({
          'id': 'message',
          'fromAddress': 'sender@example.com',
          'fromName': 'Sender',
          'subject': 'Review',
          'receivedAt': '2026-11-17T13:32:00Z',
          'safeHeaders': {'date': 'Tue, 17 Nov 2026 20:30:00 +0700'},
          'recipients': <Map<String, dynamic>>[],
        }),
      );
      await tester.pumpAndSettle();
      expect(find.text('Sent'), findsOneWidget);
      expect(find.text('Received'), findsOneWidget);
      expect(find.text('Bcc'), findsNothing);
      expect(find.text('Tue, 17 Nov 2026 20:30:00 +0700'), findsNothing);
      await tester.ensureVisible(find.text('Technical headers'));
      await tester.tap(find.text('Technical headers'));
      await tester.pumpAndSettle();
      expect(find.text('Tue, 17 Nov 2026 20:30:00 +0700'), findsOneWidget);
    },
  );

  testWidgets('resolved people protect reply-to and original recipient', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        {
          'id': 'message',
          'fromAddress': 'secret@example.com',
          'fromName': 'Header name',
          'observedRecipient': 'secret@example.com',
          'safeHeaders': {'reply-to': 'Header name <secret@example.com>'},
          'recipients': <Map<String, dynamic>>[],
        },
        people: {
          'secret@example.com': {
            'emailVisible': false,
            'displayName': 'Resolved member',
          },
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('secret@example.com'), findsNothing);
    expect(find.text('Header name'), findsNothing);
    expect(find.text('Resolved member'), findsNWidgets(3));
  });

  testWidgets('hidden profile addresses never become visible details', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness({
        'id': 'message',
        'fromAddress': 'secret@example.com',
        'fromProfile': {'emailVisible': false, 'displayName': 'Private member'},
        'recipients': <Map<String, dynamic>>[],
      }),
    );
    await tester.pumpAndSettle();
    expect(find.text('secret@example.com'), findsNothing);
    expect(find.text('Private member'), findsOneWidget);
    expect(find.text('Date unavailable'), findsOneWidget);
  });
}
