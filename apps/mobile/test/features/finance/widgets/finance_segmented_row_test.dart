import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/finance/widgets/finance_segmented_row.dart';

import '../../../helpers/pump_app.dart';

double _radiusOf(Decoration? decoration) =>
    ((decoration! as BoxDecoration).borderRadius! as BorderRadius).topLeft.x;

void main() {
  for (final textScale in [1.0, 2.0]) {
    testWidgets('selected segment is concentric with the track at '
        '${textScale}x text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = textScale;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      var leftTaps = 0;
      var rightTaps = 0;
      await tester.pumpWidget(
        sorbetTestApp(
          home: Center(
            child: SizedBox(
              width: 320,
              child: FinanceSegmentedRow(
                key: const Key('row'),
                leftLabel: 'Category',
                rightLabel: 'Tag',
                leftSelected: true,
                onLeftPressed: () => leftTaps++,
                onRightPressed: () => rightTaps++,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final row = find.byKey(const Key('row'));
      final trackFinder = find
          .descendant(
            of: row,
            matching: find.byWidgetPredicate(
              (widget) => widget is Container && widget.decoration != null,
            ),
          )
          .first;
      final faces = find.descendant(of: row, matching: find.byType(Ink));
      expect(faces, findsNWidgets(2));

      final track = tester.getRect(trackFinder);
      final left = tester.getRect(faces.first);
      final right = tester.getRect(faces.last);
      const inset = FinanceSegmentedRow.inset;
      expect(left.top - track.top, closeTo(inset, 0.01));
      expect(track.bottom - left.bottom, closeTo(inset, 0.01));
      expect(left.left - track.left, closeTo(inset, 0.01));
      expect(track.right - right.right, closeTo(inset, 0.01));
      expect(right.left - left.right, closeTo(inset, 0.01));

      final trackRadius = _radiusOf(
        tester.widget<Container>(trackFinder).decoration,
      );
      final faceRadius = _radiusOf(tester.widget<Ink>(faces.first).decoration);
      expect(trackRadius, FinanceSegmentedRow.trackRadius);
      expect(faceRadius, closeTo(trackRadius - inset, 0.01));
      expect(tester.takeException(), isNull);

      await tester.tap(find.text('Tag'));
      await tester.tap(find.text('Category'));
      expect((leftTaps, rightTaps), (1, 1));
    });
  }
}
