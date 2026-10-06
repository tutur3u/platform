import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/text_editing_harness.dart';

void main() {
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    for (final material in [false, true]) {
      for (final multiline in [false, true]) {
        final label = '$platform material=$material multiline=$multiline';
        testWidgets('$label copy cut paste and select all preserve focus', (
          tester,
        ) async {
          final h = TextEditingHarness(tester);
          await h.mount(
            platform: platform,
            material: material,
            multiline: multiline,
          );
          await h.focusField();
          await h.menu();
          await h.tapMenu('Copy');
          expect(h.clipboard, 'alpha');
          expect(h.controller.text, 'alpha beta');
          expect(h.focus.hasFocus, isTrue);
          await h.menu();
          await h.tapMenu('Cut');
          expect(h.clipboard, 'alpha');
          expect(h.controller.text, ' beta');
          expect(h.focus.hasFocus, isTrue);
          h.clipboard = multiline ? 'line one\nline two' : 'new';
          await h.menu(end: 0);
          await h.tapMenu('Paste');
          expect(h.controller.text, '${h.clipboard} beta');
          expect(h.focus.hasFocus, isTrue);
          await h.menu(end: 0);
          await h.tapMenu(
            platform == TargetPlatform.iOS ? 'Select All' : 'Select all',
          );
          expect(h.controller.selection.baseOffset, 0);
          expect(h.controller.selection.extentOffset, h.controller.text.length);
          await h.unmount();
        });
      }
    }
    testWidgets('$platform long press opens actionable menu', (tester) async {
      final h = TextEditingHarness(tester);
      await h.mount(platform: platform);
      await h.focusField();
      final caret = h.editable.renderEditable.getLocalRectForCaret(
        const TextPosition(offset: 2),
      );
      await tester.longPressAt(
        h.editable.renderEditable.localToGlobal(caret.center),
      );
      await tester.pumpAndSettle();
      await h.tapMenu('Paste');
      expect(h.controller.text, contains('pasted'));
      expect(h.focus.hasFocus, isTrue);
      await h.unmount();
    });
    testWidgets('$platform empty input paste with modal and large text', (
      tester,
    ) async {
      final h = TextEditingHarness(tester, text: '');
      await h.mount(platform: platform, modal: true, largeText: true);
      await h.focusField();
      await h.menu(end: 0);
      await h.tapMenu('Paste');
      expect(h.controller.text, 'pasted');
      expect(h.focus.hasFocus, isTrue);
      await h.unmount();
    });
  }

  testWidgets('hardware shortcuts preserve selection editing and focus', (
    tester,
  ) async {
    final h = TextEditingHarness(tester);
    await h.mount();
    await h.focusField();
    Future<void> shortcut(LogicalKeyboardKey key) async {
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyEvent(key);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pump();
    }

    await shortcut(LogicalKeyboardKey.keyA);
    await shortcut(LogicalKeyboardKey.keyC);
    expect(h.clipboard, 'alpha beta');
    await shortcut(LogicalKeyboardKey.keyX);
    expect(h.controller.text, '');
    h.clipboard = 'keyboard paste';
    await shortcut(LogicalKeyboardKey.keyV);
    expect(h.controller.text, 'keyboard paste');
    expect(h.focus.hasFocus, isTrue);
    await h.unmount();
  });
}
