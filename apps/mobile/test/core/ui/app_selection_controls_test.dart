import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

void main() {
  testWidgets('switch is custom, toggles once and supports keyboard', (
    tester,
  ) async {
    var value = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => AppSwitch(
              value: value,
              semanticLabel: 'Enabled',
              onChanged: (next) => update(() => value = next),
            ),
          ),
        ),
      ),
    );
    expect(find.byType(Switch), findsNothing);
    expect(
      tester.getSize(find.byType(AppSwitch)).height,
      greaterThanOrEqualTo(48),
    );
    await tester.tap(find.byType(AppSwitch));
    await tester.pumpAndSettle();
    expect(value, isTrue);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.space);
    await tester.pumpAndSettle();
    expect(value, isFalse);
  });

  testWidgets('checkbox cycles mixed state', (tester) async {
    bool? value = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => AppCheckbox(
              value: value,
              tristate: true,
              onChanged: (next) => update(() => value = next),
            ),
          ),
        ),
      ),
    );
    for (final next in <bool?>[true, null, false]) {
      await tester.tap(find.byType(AppCheckbox));
      await tester.pump();
      expect(value, next);
    }
    expect(find.byType(Checkbox), findsNothing);
  });

  testWidgets('chips select and slider snaps to bounded divisions', (
    tester,
  ) async {
    var selected = false;
    var value = 0.0;
    double? committed;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              AppChip(
                label: const Text('Calendar'),
                selected: selected,
                onSelected: (next) => selected = next,
              ),
              AppSlider(
                value: value,
                divisions: 4,
                onChanged: (next) => value = next,
                onChangeEnd: (next) => committed = next,
              ),
            ],
          ),
        ),
      ),
    );
    await tester.tap(find.text('Calendar'));
    expect(selected, isTrue);
    final slider = tester.getRect(find.byType(AppSlider));
    await tester.tapAt(
      Offset(slider.left + slider.width * .75, slider.center.dy),
    );
    expect(value, .75);
    await tester.drag(find.byType(AppSlider), const Offset(100, 0));
    expect(committed, value);
    expect(find.byType(Slider), findsNothing);
  });
  test('chip modes reject conflicting selection callbacks', () {
    expect(
      () => AppChip(label: const Text('Choice'), onSelected: (_) {}),
      throwsAssertionError,
    );
    expect(
      () => AppChip(
        label: const Text('Action'),
        selected: false,
        onPressed: () {},
      ),
      throwsAssertionError,
    );
    expect(
      () => AppChip(
        label: const Text('Both'),
        selected: true,
        onSelected: (_) {},
        onPressed: () {},
      ),
      throwsAssertionError,
    );
  });

  testWidgets('disabled controls expose no tap or adjustment action', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        const MaterialApp(
          home: AppScaffold(
            child: Column(
              children: [
                AppSwitch(value: true, onChanged: null),
                AppCheckbox(value: false, onChanged: null),
                AppChip(
                  label: Text('Choice'),
                  selected: true,
                  inMutuallyExclusiveGroup: true,
                ),
                AppSlider(value: .5, onChanged: null),
              ],
            ),
          ),
        ),
      );
      for (final type in [AppSwitch, AppCheckbox, AppChip, AppSlider]) {
        final node = tester.getSemantics(
          type == AppChip ? find.text('Choice') : find.byType(type),
        );
        expect(
          node.flagsCollection.isEnabled,
          ui.Tristate.isFalse,
          reason: type.toString(),
        );
        for (final action in [
          ui.SemanticsAction.tap,
          ui.SemanticsAction.increase,
          ui.SemanticsAction.decrease,
        ]) {
          expect(node.getSemanticsData().hasAction(action), isFalse);
        }
        if (type == AppChip) {
          expect(node.flagsCollection.isInMutuallyExclusiveGroup, isTrue);
        }
        await tester.tap(find.byType(type), warnIfMissed: false);
      }
      expect(tester.widget<AppSwitch>(find.byType(AppSwitch)).value, isTrue);
      expect(
        tester.widget<AppCheckbox>(find.byType(AppCheckbox)).value,
        isFalse,
      );
      expect(tester.widget<AppSlider>(find.byType(AppSlider)).value, .5);
    } finally {
      semantics.dispose();
    }
  });
}
