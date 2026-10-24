import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

void main() {
  testWidgets('field label stays above the outline and names the editable', (
    tester,
  ) async {
    final controller = TextEditingController(text: 'Plan');
    addTearDown(controller.dispose);
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AppTextField(
              controller: controller,
              label: 'Task title',
              placeholder: 'Task title',
            ),
          ),
        ),
      );
      final input = find.byType(TextField);
      expect(tester.widget<TextField>(input).decoration!.labelText, isNull);
      expect(find.text('Task title'), findsOneWidget);
      expect(
        tester.getBottomLeft(find.text('Task title')).dy,
        lessThan(tester.getTopLeft(input).dy),
      );
      final node = tester.getSemantics(input);
      expect(node.label, 'Task title');
      expect(node.value, 'Plan');
      expect(node.flagsCollection.isTextField, isTrue);
      controller.clear();
      await tester.pump();
      expect(find.text('Task title'), findsOneWidget);
      expect(tester.getSemantics(input).label, 'Task title');
      await tester.enterText(input, 'Review');
      expect(controller.text, 'Review');
      expect(find.text('Task title'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('chip constrains a provider avatar to a compact swatch', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppChip(
            avatar: const CircleAvatar(),
            label: const Text('Calendar'),
            onSelected: (_) {},
          ),
        ),
      ),
    );
    expect(tester.getSize(find.byType(CircleAvatar)), const Size.square(18));
    expect(
      tester.getSize(find.byType(AppChip)).height,
      greaterThanOrEqualTo(48),
    );
  });

  testWidgets('disabled choice keeps its selected state without a tap action', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: AppChip(label: Text('Limit'), selected: true)),
        ),
      );
      final node = tester.getSemantics(find.text('Limit'));
      expect(node.flagsCollection.isSelected, ui.Tristate.isTrue);
      expect(node.flagsCollection.isEnabled, ui.Tristate.isFalse);
      expect(
        node.getSemanticsData().hasAction(ui.SemanticsAction.tap),
        isFalse,
      );
    } finally {
      semantics.dispose();
    }
  });
}
