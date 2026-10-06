import 'dart:ui' show PointerDeviceKind;

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/text_editing_harness.dart';

void main() {
  testWidgets('iOS command shortcuts retain native clipboard operations', (
    tester,
  ) async {
    final h = TextEditingHarness(tester);
    await h.mount(platform: TargetPlatform.iOS);
    await h.focusField();
    Future<void> shortcut(LogicalKeyboardKey key) async {
      await tester.sendKeyDownEvent(LogicalKeyboardKey.metaLeft);
      await tester.sendKeyEvent(key);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.metaLeft);
      await tester.pump();
    }

    await shortcut(LogicalKeyboardKey.keyA);
    await shortcut(LogicalKeyboardKey.keyC);
    expect(h.clipboard, 'alpha beta');
    await shortcut(LogicalKeyboardKey.keyX);
    expect(h.controller.text, '');
    h.clipboard = 'command paste';
    await shortcut(LogicalKeyboardKey.keyV);
    expect(h.controller.text, 'command paste');
    expect(h.focus.hasFocus, isTrue);
    await h.unmount();
  });
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    testWidgets('$platform scrollable multiline field keeps editing focus', (
      tester,
    ) async {
      final text = List.generate(16, (index) => 'line $index').join('\n');
      final h = TextEditingHarness(tester, text: text);
      await h.mount(platform: platform, multiline: true);
      await h.focusField();
      await tester.drag(find.byType(EditableText), const Offset(0, 70));
      await tester.pumpAndSettle();
      expect(h.focus.hasFocus, isTrue);
      expect(h.controller.text, text);
      await h.menu(end: 6);
      await h.tapMenu('Copy');
      expect(h.clipboard, 'line 0');
      expect(h.focus.hasFocus, isTrue);
      await h.unmount();
    });
  }
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    for (final kind in [PointerDeviceKind.mouse, PointerDeviceKind.stylus]) {
      testWidgets('$platform $kind outside without IME uses native dismissal', (
        tester,
      ) async {
        final h = TextEditingHarness(tester);
        await h.mount(platform: platform, keyboard: false);
        await h.focusField();
        final gesture = await tester.startGesture(
          tester.getCenter(find.text('Outside field')),
          kind: kind,
        );
        await tester.pump();
        await gesture.up();
        await tester.pump();
        expect(h.focus.hasFocus, isFalse);
        expect(h.controller.text, 'alpha beta');
        await h.unmount();
      });
    }
  }
}
