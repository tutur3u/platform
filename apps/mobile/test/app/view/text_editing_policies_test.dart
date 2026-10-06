import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/widgets/dismiss_keyboard_on_pointer_down.dart';

import '../../helpers/text_editing_harness.dart';

void main() {
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    for (final material in [false, true]) {
      final label = '$platform material=$material';
      testWidgets('$label read only permits copy but no cut or paste', (
        tester,
      ) async {
        final h = TextEditingHarness(tester);
        await h.mount(platform: platform, material: material, readOnly: true);
        await h.focusField();
        await h.menu();
        expect(find.text('Cut'), findsNothing);
        expect(find.text('Paste'), findsNothing);
        await h.tapMenu('Copy');
        expect(h.clipboard, 'alpha');
        expect(h.controller.text, 'alpha beta');
        await h.unmount();
      });
      testWidgets('$label disabled input cannot acquire editing focus', (
        tester,
      ) async {
        final h = TextEditingHarness(tester);
        await h.mount(platform: platform, material: material, enabled: false);
        await tester.tap(find.byType(EditableText), warnIfMissed: false);
        await tester.pump();
        expect(h.focus.hasFocus, isFalse);
        expect(find.text('Paste'), findsNothing);
        expect(h.controller.text, 'alpha beta');
        await h.unmount();
      });
      testWidgets(
        '$label obscured input hides copy and cut but permits paste',
        (tester) async {
          final h = TextEditingHarness(tester);
          await h.mount(platform: platform, material: material, obscured: true);
          await h.focusField();
          await h.menu();
          expect(find.text('Copy'), findsNothing);
          expect(find.text('Cut'), findsNothing);
          await h.tapMenu('Paste');
          expect(h.controller.text, 'pasted beta');
          expect(h.focus.hasFocus, isTrue);
          await h.unmount();
        },
      );
    }
  }
  testWidgets('tap inside preserves composing text and outside dismisses', (
    tester,
  ) async {
    final h = TextEditingHarness(tester);
    await h.mount();
    await h.focusField();
    const value = TextEditingValue(
      text: 'composing',
      selection: TextSelection.collapsed(offset: 9),
      composing: TextRange(start: 0, end: 9),
    );
    tester.testTextInput.updateEditingValue(value);
    await tester.pump();
    await tester.tap(find.byType(EditableText));
    await tester.pump();
    expect(h.focus.hasFocus, isTrue);
    expect(h.controller.text, value.text);
    expect(h.controller.value.composing, value.composing);
    await tester.tap(find.text('Outside field'));
    await tester.pump();
    expect(h.focus.hasFocus, isFalse);
    expect(h.controller.text, value.text);
    await h.unmount();
  });
  testWidgets('dismiss guard suspends only outside keyboard dismissal', (
    tester,
  ) async {
    final h = TextEditingHarness(tester);
    await h.mount();
    await h.focusField();
    KeyboardDismissGuard.suspend();
    try {
      await tester.tap(find.text('Outside field'));
      await tester.pump();
      expect(h.focus.hasFocus, isTrue);
    } finally {
      KeyboardDismissGuard.resume();
    }
    await tester.tap(find.text('Outside field'));
    await tester.pump();
    expect(h.focus.hasFocus, isFalse);
    await h.unmount();
  });
  testWidgets('custom outside handler retains ownership of its action', (
    tester,
  ) async {
    final h = TextEditingHarness(tester);
    var outsideCalls = 0;
    await h.mount(onTapOutside: (_) => outsideCalls++);
    await h.focusField();
    await tester.tap(find.text('Outside field'));
    await tester.pump();
    expect(outsideCalls, 1);
    expect(h.focus.hasFocus, isTrue);
    await h.unmount();
  });
  testWidgets('default shad menu performs actual clipboard paste', (
    tester,
  ) async {
    final h = TextEditingHarness(tester);
    await h.mount(nativeMenu: false);
    await h.focusField();
    await h.menu();
    await h.tapMenu('Paste');
    expect(h.controller.text, 'pasted beta');
    expect(h.focus.hasFocus, isTrue);
    await h.unmount();
  });
  testWidgets('native field accessory region preserves focus and composition', (
    tester,
  ) async {
    final h = TextEditingHarness(tester);
    await h.mount(accessory: const Text('Field accessory'));
    await h.focusField();
    await tester.tap(find.text('Field accessory'));
    await tester.pump();
    expect(h.focus.hasFocus, isTrue);
    expect(h.controller.text, 'alpha beta');
    await h.unmount();
  });
  testWidgets('outside touch without visible IME keeps existing focus policy', (
    tester,
  ) async {
    final h = TextEditingHarness(tester);
    await h.mount(keyboard: false);
    await h.focusField();
    await tester.tap(find.text('Outside field'));
    await tester.pump();
    expect(h.focus.hasFocus, isTrue);
    await h.unmount();
  });
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    testWidgets('$platform Vietnamese toolbar paste is actionable', (
      tester,
    ) async {
      final h = TextEditingHarness(tester);
      await h.mount(platform: platform, locale: const Locale('vi'));
      // shadcn 0.0.54 lacks vi; native Flutter editing delegates support it.
      expect(
        tester.takeException(),
        contains("This application's locale, vi, is not supported by all"),
      );
      await h.focusField();
      await h.menu();
      await h.tapMenu('Dán');
      expect(h.controller.text, 'pasted beta');
      expect(h.focus.hasFocus, isTrue);
      await h.unmount();
    });
  }
  testWidgets('nested dialog consumed inset still dismisses visible keyboard', (
    tester,
  ) async {
    final h = TextEditingHarness(tester);
    await h.mount(modal: true, nestedDismissal: true);
    final wrappers = find.byType(DismissKeyboardOnPointerDown);
    expect(wrappers, findsNWidgets(2));
    expect(MediaQuery.viewInsetsOf(tester.element(wrappers.last)).bottom, 0);
    await h.focusField();
    await tester.ensureVisible(find.text('Outside field'));
    await tester.tap(find.text('Outside field'));
    await tester.pump();
    expect(h.focus.hasFocus, isFalse);
    await h.unmount();
  });
}
