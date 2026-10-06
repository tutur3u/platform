import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/text_editing_harness.dart';

void main() {
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    for (final area in [false, true]) {
      testWidgets('$platform area=$area paste respects field type', (
        tester,
      ) async {
        final h = TextEditingHarness(tester, text: 'old text');
        await h.mount(platform: platform, textArea: area, formField: !area);
        await h.focusField();
        h.clipboard = area ? 'first\nsecond' : 'first';
        await h.menu(end: 3);
        await h.tapMenu('Paste');
        expect(h.controller.text, '${h.clipboard} text');
        expect(h.focus.hasFocus, isTrue);
        await h.unmount();
      });
    }
    testWidgets('$platform numeric OTP paste retains filtering and limit', (
      tester,
    ) async {
      final h = TextEditingHarness(tester, text: '');
      await h.mount(
        platform: platform,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(6),
        ],
      );
      h.clipboard = 'a12 34-5678';
      await h.focusField();
      await h.menu(end: 0);
      await h.tapMenu('Paste');
      expect(h.controller.text, '123456');
      expect(h.focus.hasFocus, isTrue);
      await h.unmount();
    });
  }
}
