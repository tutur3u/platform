import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

void main() {
  testWidgets('date cell announces its full date once and remains actionable', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      DateTime? result;
      final date = DateTime(2024, 2, 29);
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => AppButton(
              onPressed: () async {
                result = await showAppDatePicker(
                  context: context,
                  initialDate: date,
                  firstDate: DateTime(2024, 2),
                  lastDate: date,
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      final button = find.widgetWithText(AppButton, '29');
      final node = tester.getSemantics(button);
      expect(
        node.label,
        MaterialLocalizations.of(tester.element(button)).formatFullDate(date),
      );
      expect(node.flagsCollection.isSelected, ui.Tristate.isTrue);
      expect(node.getSemanticsData().hasAction(ui.SemanticsAction.tap), isTrue);
      tester.binding.performSemanticsAction(
        ui.SemanticsActionEvent(
          viewId: tester.view.viewId,
          nodeId: node.id,
          type: ui.SemanticsAction.tap,
        ),
      );
      await tester.pumpAndSettle();
      expect(result, date);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('confirmation uses ghost Cancel and does not confirm dismissal', (
    tester,
  ) async {
    bool? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => AppButton(
            child: const Text('Open'),
            onPressed: () async {
              result = await showAppConfirmDialog(
                context: context,
                title: 'Confirm',
                confirmLabel: 'Confirm',
                cancelLabel: 'Cancel',
              );
            },
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    final cancel = find.widgetWithText(AppButton, 'Cancel');
    expect(tester.widget<AppButton>(cancel).variant, AppButtonVariant.ghost);
    await tester.tap(cancel);
    await tester.pumpAndSettle();
    expect(result, isFalse);
  });
}
