import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_recipient_summary.dart';

import '../../helpers/pump_app.dart';

void main() {
  const senderKey = ValueKey('sender');
  const detailsKey = ValueKey('details');

  Future<void> pump(
    WidgetTester tester, {
    String? address = 'reader@example.test',
    DateTime? date,
  }) => tester.pumpApp(
    Material(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(key: senderKey, height: 40),
          MailRecipientSummary(
            address: address,
            name: 'Reader Name',
            date: date ?? DateTime(2026, 11, 18, 5, 40),
          ),
          const SizedBox(key: detailsKey, height: 48),
        ],
      ),
    ),
  );

  testWidgets('To row and date keep vertical clearance on every side', (
    tester,
  ) async {
    await pump(tester);
    await tester.pump();

    final sender = tester.getRect(find.byKey(senderKey));
    final recipient = tester.getRect(
      find.byKey(const ValueKey('mail-recipient-row')),
    );
    final date = tester.getRect(
      find.byKey(const ValueKey('mail-recipient-date')),
    );
    final details = tester.getRect(find.byKey(detailsKey));

    expect(
      recipient.top - sender.bottom,
      greaterThanOrEqualTo(MailRecipientSummary.topGap),
    );
    expect(
      date.top - recipient.bottom,
      greaterThanOrEqualTo(MailRecipientSummary.lineGap),
    );
    expect(
      details.top - date.bottom,
      greaterThanOrEqualTo(MailRecipientSummary.bottomGap),
    );
  });

  testWidgets('To label is separated from the recipient avatar', (
    tester,
  ) async {
    await pump(tester);
    await tester.pump();

    final label = tester.getRect(
      find.descendant(
        of: find.byKey(const ValueKey('mail-recipient-row')),
        matching: find.byType(Text).first,
      ),
    );
    final avatar = tester.getRect(find.byType(CircleAvatar));

    expect(avatar.left - label.right, greaterThanOrEqualTo(8));
  });

  testWidgets('renders only the date when no recipient is known', (
    tester,
  ) async {
    await pump(tester, address: null);
    await tester.pump();

    expect(find.byKey(const ValueKey('mail-recipient-row')), findsNothing);
    final sender = tester.getRect(find.byKey(senderKey));
    final date = tester.getRect(
      find.byKey(const ValueKey('mail-recipient-date')),
    );
    expect(
      date.top - sender.bottom,
      greaterThanOrEqualTo(MailRecipientSummary.topGap),
    );
  });
}
