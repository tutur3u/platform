import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_segmented_control.dart';

import '../../../../helpers/helpers.dart';

Future<List<String>> _pump(
  WidgetTester tester, {
  String selected = 'a',
  double textScale = 1,
}) async {
  final changes = <String>[];
  await tester.pumpApp(
    Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(textScale)),
        child: Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            width: 360,
            child: MastermindSegmentedControl<String>(
              selected: selected,
              onChanged: changes.add,
              segments: const [
                AppSegment(value: 'a', label: 'Needs you'),
                AppSegment(value: 'b', label: 'Decisions'),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  return changes;
}

void main() {
  testWidgets('a compact 32 pt track inside a 44 pt hit area', (tester) async {
    await _pump(tester);
    final control = tester.getSize(
      find.byType(MastermindSegmentedControl<String>),
    );
    expect(control.height, 44);
    final track = tester.getSize(
      find
          .descendant(
            of: find.byType(MastermindSegmentedControl<String>),
            matching: find.byType(DecoratedBox),
          )
          .first,
    );
    expect(track.height, MastermindSegmentedControl.trackHeight);
    // The old control was a tall pill; this one is visibly shorter.
    expect(track.height, lessThan(44));
  });

  testWidgets('every segment owns a full 44 pt target, edges included', (
    tester,
  ) async {
    final changes = await _pump(tester);
    final control = tester.getRect(
      find.byType(MastermindSegmentedControl<String>),
    );
    final label = tester.getCenter(find.text('Decisions'));
    expect(control.height, greaterThanOrEqualTo(44));
    // A tap in the transparent band above the track still selects, and so
    // does one in the band below it.
    await tester.tapAt(Offset(label.dx, control.top + 2));
    await tester.tapAt(Offset(label.dx, control.bottom - 2));
    expect(changes, ['b', 'b']);
  });

  testWidgets('announces selection in a mutually exclusive group', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await _pump(tester);
    expect(
      tester.getSemantics(find.text('Needs you')),
      isSemantics(
        label: 'Needs you',
        isButton: true,
        isSelected: true,
        isInMutuallyExclusiveGroup: true,
        hasTapAction: true,
      ),
    );
    expect(
      tester.getSemantics(find.text('Decisions')),
      isSemantics(
        label: 'Decisions',
        isButton: true,
        isSelected: false,
        isInMutuallyExclusiveGroup: true,
      ),
    );
    handle.dispose();
  });

  testWidgets('grows with large text instead of clipping', (tester) async {
    await _pump(tester, textScale: 2);
    expect(tester.takeException(), isNull);
    final control = tester.getSize(
      find.byType(MastermindSegmentedControl<String>),
    );
    expect(control.height, greaterThanOrEqualTo(44));
    final label = tester.getRect(find.text('Needs you'));
    final box = tester.getRect(find.byType(MastermindSegmentedControl<String>));
    expect(box.top, lessThanOrEqualTo(label.top));
    expect(box.bottom, greaterThanOrEqualTo(label.bottom));
  });

  test('keeps the track between the 44 pt bounds', () {
    expect(
      MastermindSegmentedControl.trackHeight +
          2 * MastermindSegmentedControl.trackInset,
      44,
    );
  });
}
