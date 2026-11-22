import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_reader_header.dart';
import 'package:mobile/features/mail/view/mail_reader_identity.dart';

import '../../helpers/pump_app.dart';

/// The reader's compact message header: avatar, sender and relative time on
/// one line, the recipients toggle below, Reply and the message menu last.
Future<void> _pump(
  WidgetTester tester, {
  required double width,
  double textScale = 1,
  String? snippet,
  VoidCallback? onToggleDetails,
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
            MailMessageHeader(
              address: 'no_reply@email.example.test',
              name: 'Tuturuuu via a very long relay sender name',
              date: DateTime.now().subtract(const Duration(hours: 4)),
              recipients: 'to me +2',
              snippet: snippet,
              onToggleDetails: onToggleDetails ?? () {},
              onMore: () {},
            ),
          ],
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  // Real proportional glyphs, so widths match a device instead of the
  // square test font.
  setUpAll(() async {
    for (final family in ['Roboto', 'NotoSans']) {
      await (FontLoader(
        family,
      )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
    }
  });

  testWidgets('one compact row: name, relative time, recipients, actions', (
    tester,
  ) async {
    var toggled = 0;
    await _pump(tester, width: 390, onToggleDetails: () => toggled++);

    final row = tester.getRect(find.byKey(const ValueKey('mail-sender-row')));
    expect(row.height, lessThan(56));
    final name = find.textContaining('Tuturuuu via');
    expect(tester.widget<Text>(name).overflow, TextOverflow.ellipsis);
    final date = find.byKey(const ValueKey('mail-sender-date'));
    expect(find.text('4h ago'), findsOneWidget);
    expect(
      tester.getRect(name).right,
      lessThanOrEqualTo(tester.getRect(date).left),
    );
    expect(find.byTooltip('Reply'), findsNothing);
    expect(find.byTooltip('Message actions'), findsOneWidget);

    final recipients = find.byKey(const ValueKey('mail-recipients-toggle'));
    expect(find.text('to me +2'), findsOneWidget);
    expect(
      tester.getRect(recipients).top,
      greaterThanOrEqualTo(tester.getRect(date).bottom - 1),
    );
    await tester.tap(recipients);
    expect(toggled, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a folded message shows its snippet instead of recipients', (
    tester,
  ) async {
    await _pump(tester, width: 390, snippet: 'Earlier message text');

    expect(find.text('Earlier message text'), findsOneWidget);
    expect(find.byKey(const ValueKey('mail-recipients-toggle')), findsNothing);
  });

  testWidgets('fits 320 wide with 2x text', (tester) async {
    await _pump(tester, width: 320, textScale: 2);

    expect(tester.takeException(), isNull);
    final row = tester.getRect(find.byKey(const ValueKey('mail-sender-row')));
    expect(row.right, lessThanOrEqualTo(320 - 16 + 0.5));
  });

  testWidgets(
    'recipient toggle keeps its semantic tap action and touch target',
    (tester) async {
      final semantics = tester.ensureSemantics();
      try {
        var folded = 0;
        var toggled = 0;
        await tester.pumpApp(
          Material(
            child: MailMessageHeader(
              address: 'sender@example.test',
              name: 'Sender',
              date: DateTime.now().subtract(const Duration(hours: 1)),
              recipients: 'to me +2',
              onTap: () => folded++,
              onToggleDetails: () => toggled++,
              onMore: () {},
            ),
          ),
        );
        await tester.pump();

        final toggleFinder = find.byKey(
          const ValueKey('mail-recipients-toggle'),
        );
        final size = tester.getSize(toggleFinder);
        expect(size.width, greaterThanOrEqualTo(48));
        expect(size.height, greaterThanOrEqualTo(32));

        final node = tester.getSemantics(toggleFinder);
        final data = node.getSemanticsData();
        expect(data.hasAction(SemanticsAction.tap), isTrue);
        expect(data.hasFlag(SemanticsFlag.isButton), isTrue);
        expect(data.label, contains('to me +2'));

        await tester.tap(toggleFinder);
        expect(toggled, 1);
        expect(folded, 0);
      } finally {
        semantics.dispose();
      }
    },
  );

  test(
    'mailShareText omits raw sender addresses when hidden or unresolved',
    () {
      const message = <String, dynamic>{
        'fromAddress': 'secret@example.test',
        'fromName': 'Hidden Sender',
        'bodyText': 'Body copy',
      };
      expect(
        mailShareText(
          subject: 'Subject',
          message: message,
          profile: const {
            'emailVisible': false,
            'displayName': 'Private Member',
          },
          hiddenFallback: 'Member',
        ),
        'Subject\n\nPrivate Member\n\nBody copy',
      );
      expect(
        mailShareText(
          subject: 'Subject',
          message: const <String, dynamic>{
            'fromAddress': 'secret@example.test',
            'bodyText': 'Body copy',
          },
          profile: null,
          hiddenFallback: 'Member',
        ),
        'Subject\n\nMember\n\nBody copy',
      );
      // The resolver reports an unknown sender without a visibility grant.
      expect(
        mailShareText(
          subject: 'Subject',
          message: message,
          profile: const {
            'kind': 'unknown',
            'email': 'secret@example.test',
            'displayName': null,
          },
          hiddenFallback: 'Member',
        ),
        'Subject\n\nHidden Sender\n\nBody copy',
      );
      expect(
        mailShareText(
          subject: 'Subject',
          message: message,
          profile: const {
            'emailVisible': true,
            'displayName': 'Visible Member',
          },
          hiddenFallback: 'Member',
        ),
        'Subject\n\nVisible Member <secret@example.test>\n\nBody copy',
      );
    },
  );

  testWidgets('relative times', (tester) async {
    await tester.pumpApp(const SizedBox());
    final context = tester.element(find.byType(SizedBox));
    final now = DateTime(2026, 11, 22, 11, 30);
    String at(Duration ago) =>
        formatMailRelativeDate(context, now.subtract(ago), now: now);
    expect(at(const Duration(seconds: 20)), 'Just now');
    expect(at(const Duration(minutes: 12)), '12m ago');
    expect(at(const Duration(hours: 4)), '4h ago');
    expect(at(const Duration(days: 2)), 'Nov 20');
    expect(
      formatMailRelativeDate(context, DateTime(2025, 3, 4), now: now),
      'Mar 4, 2025',
    );
  });
}
