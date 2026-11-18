import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/features/mastermind/threads/threads_segmented_control.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_segmented_control.dart';

import '../../helpers/helpers.dart';

double _radiusOf(Decoration? decoration) =>
    ((decoration! as BoxDecoration).borderRadius! as BorderRadius).topLeft.x;

const List<AppSegment<String>> _segments = [
  AppSegment(value: 'a', label: 'Needs you'),
  AppSegment(value: 'b', label: 'Decisions'),
];

void main() {
  for (final (name, control) in [
    (
      'Mastermind',
      MastermindSegmentedControl<String>(
        key: const Key('control'),
        selected: 'a',
        onChanged: (_) {},
        segments: _segments,
      ),
    ),
    (
      'Threads',
      ThreadsSegmentedControl<String>(
        key: const Key('control'),
        selected: 'a',
        onChanged: (_) {},
        segments: _segments,
      ),
    ),
  ]) {
    testWidgets('$name selected segment is concentric with its track', (
      tester,
    ) async {
      await tester.pumpApp(
        Align(
          alignment: Alignment.topCenter,
          child: SizedBox(width: 360, child: control),
        ),
      );
      final root = find.byKey(const Key('control'));
      final trackFinder = find
          .descendant(of: root, matching: find.byType(DecoratedBox))
          .first;
      final faceFinder = find.descendant(
        of: root,
        matching: find.byWidgetPredicate(
          (widget) =>
              widget is Container &&
              (widget.decoration as BoxDecoration?)?.color != null,
        ),
      );
      expect(faceFinder, findsOneWidget);

      final track = tester.getRect(trackFinder);
      final face = tester.getRect(faceFinder);
      final padding = face.left - track.left;
      expect(padding, greaterThan(0));
      expect(face.top - track.top, closeTo(padding, 0.01));
      expect(track.bottom - face.bottom, closeTo(padding, 0.01));

      final trackRadius = _radiusOf(
        tester.widget<DecoratedBox>(trackFinder).decoration,
      );
      final faceRadius = _radiusOf(
        tester.widget<Container>(faceFinder).decoration,
      );
      expect(faceRadius, closeTo(trackRadius - padding, 0.01));
    });
  }
}
