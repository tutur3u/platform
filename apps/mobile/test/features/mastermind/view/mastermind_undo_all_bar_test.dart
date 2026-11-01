import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_undo_bar.dart';

import '../../../helpers/helpers.dart';

void main() {
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
