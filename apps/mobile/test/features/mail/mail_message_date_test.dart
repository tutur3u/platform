import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  test(
    'uses the first valid timestamp and preserves the instant across offsets',
    () {
      final parsed = mailMessageDate({
        'sentAt': 'invalid',
        'receivedAt': '2026-09-20T17:56:18+07:00',
        'createdAt': '2026-09-19T00:00:00Z',
      });
      expect(parsed, DateTime.parse('2026-09-20T10:56:18Z').toLocal());
      expect(parsed!.isUtc, isFalse);
      expect(mailMessageDate({'sentAt': 'invalid'}), isNull);
      expect(mailMessageDate({}), isNull);
    },
  );

  test('thread timestamps do not replace individual message dates', () {
    final message = {
      'lastMessageAt': '2026-09-21T10:00:00Z',
      'sentAt': '2026-09-20T10:00:00Z',
    };
    expect(
      mailMessageDate(message),
      DateTime.parse(message['sentAt']!).toLocal(),
    );
    expect(
      mailMessageDate(message, thread: true),
      DateTime.parse(message['lastMessageAt']!).toLocal(),
    );
  });

  Future<String> render(
    WidgetTester tester, {
    String locale = 'en',
    bool use24Hours = false,
    bool compact = false,
    DateTime? date,
  }) async {
    var formatted = '';
    await tester.pumpWidget(
      MaterialApp(
        locale: Locale(locale),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: MediaQuery(
          data: MediaQueryData(alwaysUse24HourFormat: use24Hours),
          child: Builder(
            builder: (context) {
              formatted = formatMailMessageDate(
                context,
                date ?? DateTime(2026, 9, 20, 17, 56),
                now: DateTime(2026, 9, 20),
                compact: compact,
              );
              return Text(formatted);
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    return formatted;
  }

  testWidgets('reader and inbox honor the device clock preference', (
    tester,
  ) async {
    final reader12 = await render(tester);
    expect(reader12, contains('2026'));
    expect(reader12, contains('5:56'));
    expect(reader12, contains('PM'));
    expect(await render(tester, use24Hours: true), endsWith('17:56'));
    expect(await render(tester, compact: true, use24Hours: true), '17:56');
    expect(await render(tester, compact: true), contains('PM'));
  });

  testWidgets(
    'Vietnamese dates are localized and older inbox dates include the year',
    (tester) async {
      final vietnamese = await render(tester, locale: 'vi');
      expect(vietnamese, contains('2026'));
      expect(vietnamese, contains('17:56'));
      expect(vietnamese, isNot(contains('Sep')));
      expect(
        await render(tester, compact: true, date: DateTime(2025, 9, 20)),
        contains('2025'),
      );
    },
  );
}
