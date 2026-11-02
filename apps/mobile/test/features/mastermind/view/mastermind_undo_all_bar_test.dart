import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_undo_bar.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('dark mode and 2x text keeps Send now and Undo reachable', (
    tester,
  ) async {
    var sent = 0;
    final now = DateTime.utc(2026);
    await tester.pumpApp(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: Column(
          children: [
            ReplyUndoBar(
              option: 'Approve',
              onUndo: () {},
              onSendNow: () => sent++,
            ),
            MastermindUndoAllBar(
              count: 2,
              expiresAt: now.add(const Duration(seconds: 5)),
              now: () => now,
              onUndoAll: () {},
              onSendNow: () => sent++,
            ),
          ],
        ),
      ),
      themeMode: ThemeMode.dark,
    );
    expect(tester.takeException(), isNull);
    final buttons = find.widgetWithText(TextButton, 'Send now');
    expect(buttons, findsNWidgets(2));
    await tester.tap(buttons.first);
    await tester.tap(buttons.last);
    expect(sent, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets('shows count and a ticking countdown; tap undoes all', (
    tester,
  ) async {
    var now = DateTime.utc(2026, 1, 31, 17, 32);
    final until = now.add(const Duration(seconds: 30));
    var taps = 0;
    await tester.pumpApp(
      MastermindUndoAllBar(
        count: 3,
        expiresAt: until,
        now: () => now,
        onUndoAll: () => taps++,
      ),
    );
    expect(find.text('3 · 0:30'), findsOneWidget);
    now = now.add(const Duration(seconds: 12));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('3 · 0:18'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'Undo (3)'));
    expect(taps, 1);
  });

  testWidgets('hides when nothing is held or the window ended', (tester) async {
    final now = DateTime.utc(2026, 1, 31, 17, 32);
    await tester.pumpApp(
      MastermindUndoAllBar(
        count: 0,
        expiresAt: null,
        now: () => now,
        onUndoAll: () {},
      ),
    );
    expect(find.byType(TextButton), findsNothing);
  });
}
