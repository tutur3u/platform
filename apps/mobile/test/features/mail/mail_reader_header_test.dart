import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_reader_header.dart';

import '../../helpers/pump_app.dart';

final _date = DateTime(2026, 11, 18, 9, 48);

/// The reader's message header: sender row as the expansion title and the
/// recipient line as its subtitle, inside the page gutter.
Future<void> _pump(
  WidgetTester tester, {
  required double width,
  double textScale = 1,
}) async {
  tester.view.physicalSize = Size(width, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpApp(
    Material(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: ListView(
          children: [
            ExpansionTile(
              initiallyExpanded: true,
              tilePadding: EdgeInsets.zero,
              dense: true,
              title: MailReaderSenderRow(
                address: 'no_reply@email.apple.com',
                name: 'Tuturuuu via TestFlight',
                date: _date,
              ),
              subtitle: MailReaderRecipientLine(
                address: 'reader@example.test',
                name: 'Reader',
                date: _date,
              ),
              children: const [SizedBox(height: 48)],
            ),
          ],
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  // Real proportional glyphs, so the date's width matches a device instead
  // of the square test font.
  setUpAll(() async {
    for (final family in ['Roboto', 'NotoSans']) {
      await (FontLoader(
        family,
      )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
    }
  });

  testWidgets('date sits right-aligned on the sender row at 390 wide', (
    tester,
  ) async {
    await _pump(tester, width: 390);

    final row = find.byKey(const ValueKey('mail-sender-row'));
    final date = find.byKey(const ValueKey('mail-sender-date'));
    expect(date, findsOneWidget);
    expect(find.byKey(const ValueKey('mail-recipient-date')), findsNothing);
    expect(find.textContaining('Nov 18, 2026'), findsOneWidget);

    final rowRect = tester.getRect(row);
    final dateRect = tester.getRect(date);
    expect(dateRect.right, closeTo(rowRect.right, 0.5));
    expect(dateRect.center.dy, closeTo(rowRect.center.dy, 0.5));

    // The To row follows the sender row directly.
    final recipient = tester.getRect(
      find.byKey(const ValueKey('mail-recipient-row')),
    );
    expect(recipient.top, greaterThan(rowRect.bottom));
    expect(tester.takeException(), isNull);
  });

  testWidgets('a long sender name truncates before the date', (tester) async {
    await _pump(tester, width: 390);

    final name = tester.widget<Text>(find.text('Tuturuuu via TestFlight'));
    expect(name.overflow, TextOverflow.ellipsis);
    final nameRect = tester.getRect(find.text('Tuturuuu via TestFlight'));
    final dateRect = tester.getRect(
      find.byKey(const ValueKey('mail-sender-date')),
    );
    expect(nameRect.right, lessThanOrEqualTo(dateRect.left));
    expect(tester.takeException(), isNull);
  });

  testWidgets('falls back to the To line at 320 wide with 2x text', (
    tester,
  ) async {
    await _pump(tester, width: 320, textScale: 2);

    expect(find.byKey(const ValueKey('mail-sender-date')), findsNothing);
    final date = find.byKey(const ValueKey('mail-recipient-date'));
    expect(date, findsOneWidget);

    final sender = tester.getRect(
      find.byKey(const ValueKey('mail-sender-row')),
    );
    final recipient = tester.getRect(
      find.byKey(const ValueKey('mail-recipient-row')),
    );
    final dateRect = tester.getRect(date);
    expect(recipient.top, greaterThan(sender.bottom));
    expect(dateRect.top, greaterThanOrEqualTo(recipient.top));
    expect(dateRect.right, lessThanOrEqualTo(320 - 16 + 0.5));
    expect(tester.takeException(), isNull);
  });
}
