import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/features/mail/view/mail_swipe_tile.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'left and right choices persist independently with safe fallback',
    () async {
      final preferences = MailSwipePreferences();
      await preferences.select(swipeLeft: true, action: MailSwipeAction.trash);
      await preferences.select(swipeLeft: false, action: MailSwipeAction.none);
      final restored = MailSwipePreferences();
      await restored.load();
      expect(restored.left, MailSwipeAction.trash);
      expect(restored.right, MailSwipeAction.none);
      expect(
        MailSwipePreferences.decode('removed', MailSwipeAction.archive),
        MailSwipeAction.archive,
      );
      preferences.dispose();
      restored.dispose();
    },
  );

  testWidgets(
    'both physical swipe directions execute their configured action',
    (tester) async {
      final preferences = MailSwipePreferences();
      final actions = <MailSwipeAction>[];
      await tester.pumpApp(
        Material(
          child: Center(
            child: SizedBox(
              width: 320,
              height: 90,
              child: MailSwipeTile(
                id: 'thread',
                preferences: preferences,
                onAction: (action) async => actions.add(action),
                child: const ColoredBox(
                  color: Colors.white,
                  child: Text('Message'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.drag(find.text('Message'), const Offset(-260, 0));
      await tester.pumpAndSettle();
      expect(actions, [MailSwipeAction.archive]);
      await tester.drag(find.text('Message'), const Offset(260, 0));
      await tester.pumpAndSettle();
      expect(actions, [MailSwipeAction.archive, MailSwipeAction.read]);
      await preferences.select(swipeLeft: true, action: MailSwipeAction.none);
      await preferences.select(swipeLeft: false, action: MailSwipeAction.none);
      await tester.pumpAndSettle();
      await tester.drag(find.text('Message'), const Offset(-260, 0));
      await tester.pumpAndSettle();
      expect(actions.length, 2);
      await tester.pumpWidget(const SizedBox.shrink());
      preferences.dispose();
    },
  );
}
