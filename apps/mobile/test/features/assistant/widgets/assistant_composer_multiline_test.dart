import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';

import 'assistant_composer_dock_test.dart' as fixture;

void main() {
  testWidgets('platform Enter retains newline and only side button sends', (
    tester,
  ) async {
    final controller = TextEditingController(text: 'First line');
    final focus = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focus.dispose);
    var sends = 0;
    await tester.pumpWidget(
      fixture.composerTestApp(
        controller: controller,
        focus: focus,
        onSend: () async => sends++,
      ),
    );
    await tester.tap(find.byType(TextField));
    controller.selection = TextSelection.collapsed(
      offset: controller.text.length,
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    expect(sends, 0);
    // The platform text input system inserts Enter before its newline action.
    tester.testTextInput.updateEditingValue(
      const TextEditingValue(
        text: 'First line\n',
        selection: TextSelection.collapsed(offset: 11),
      ),
    );
    await tester.testTextInput.receiveAction(TextInputAction.newline);
    await tester.pump();
    expect(controller.text, 'First line\n');
    expect(sends, 0);
    await tester.testTextInput.receiveAction(TextInputAction.send);
    expect(sends, 0);
    await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
    expect(sends, 1);
  });

  testWidgets('prompt grows through five lines and then scrolls inside', (
    tester,
  ) async {
    final controller = TextEditingController();
    final focus = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focus.dispose);
    await tester.pumpWidget(
      fixture.composerTestApp(controller: controller, focus: focus),
    );
    final field = find.byType(TextField);
    final empty = tester.getSize(field).height;
    expect(
      tester.getSize(find.byType(AssistantComposerDock)).height,
      lessThan(100),
    );
    controller.text = 'First line';
    await tester.pumpAndSettle();
    expect(tester.getSize(field).height, empty);
    controller.text = 'One\nTwo\nThree\nFour\nFive';
    await tester.pumpAndSettle();
    final five = tester.getSize(field).height;
    expect(five, greaterThan(empty));
    controller.text += '\nSix';
    await tester.pumpAndSettle();
    expect(tester.getSize(field).height, five);
    expect(tester.takeException(), isNull);
  });
}
