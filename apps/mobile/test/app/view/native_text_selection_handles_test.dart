import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/text_editing_harness.dart';

void main() {
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    for (final area in [false, true]) {
      testWidgets('$platform area=$area native handles change selection', (
        tester,
      ) async {
        final h = TextEditingHarness(tester, text: 'abc def ghi');
        await h.mount(platform: platform, textArea: area);
        await h.focusField();
        await tester.pump(const Duration(milliseconds: 500));
        final render = h.editable.renderEditable;
        final ePosition = render.localToGlobal(
          render.getLocalRectForCaret(const TextPosition(offset: 5)).center,
        );
        if (platform == TargetPlatform.iOS) {
          await tester.tapAt(ePosition);
          await tester.pump(const Duration(milliseconds: 200));
          await tester.tapAt(ePosition);
          await tester.pump();
        } else {
          await tester.longPressAt(ePosition);
          await tester.pump();
        }
        await tester.pump(const Duration(milliseconds: 200));
        expect(h.controller.selection.start, 4);
        expect(h.controller.selection.end, 7);
        final controls = tester
            .widget<EditableText>(find.byType(EditableText))
            .selectionControls!;
        expect(
          controls.getHandleSize(render.preferredLineHeight),
          isNot(Size.zero),
        );
        final endpoints = render.getEndpointsForSelection(
          h.controller.selection,
        );
        final handle =
            render.localToGlobal(endpoints.last.point) + const Offset(1, 1);
        final target = render.localToGlobal(
          render.getLocalRectForCaret(const TextPosition(offset: 11)).center,
        );
        final gesture = await tester.startGesture(handle);
        await tester.pump();
        expect(h.focus.hasFocus, isTrue);
        await gesture.moveTo(target);
        await tester.pump();
        await gesture.up();
        await tester.pump();
        expect(h.controller.selection.start, 4);
        expect(h.controller.selection.end, 11);
        expect(h.focus.hasFocus, isTrue);
        expect(tester.takeException(), isNull);
        await h.unmount();
      });
    }
  }
}
