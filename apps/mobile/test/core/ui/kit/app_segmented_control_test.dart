import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/components/app_tap_target.dart';
import 'package:mobile/core/ui/kit/kit.dart';

import '../../../helpers/pump_app.dart';

/// The corner radius a box actually paints: Flutter scales corners that
/// exceed half a side down to fit, which turns a pill into a stadium.
double _paintedRadius(Rect rect, double radius) =>
    math.min(radius, math.min(rect.width, rect.height) / 2);

double _radiusOf(BoxDecoration decoration) =>
    (decoration.borderRadius! as BorderRadius).topLeft.x;

void main() {
  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet soft', const SorbetTheme()),
    ('sorbet sharp', const SorbetTheme(radius: SorbetRadius.sharp)),
  ]) {
    for (final textScale in [1.0, 1.6]) {
      testWidgets('$design selected segment is concentric with its track at '
          '${textScale}x text', (tester) async {
        tester.platformDispatcher.textScaleFactorTestValue = textScale;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        await tester.pumpWidget(
          sorbetTestApp(
            sorbet: sorbet,
            home: Material(
              child: Center(
                child: SizedBox(
                  width: 360,
                  child: AppSegmentedControl<int>(
                    key: const Key('segments'),
                    segments: const [
                      AppSegment(value: 0, label: 'Conversation'),
                      AppSegment(value: 1, label: 'Attachments'),
                    ],
                    selected: 0,
                    onChanged: (_) {},
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        final control = find.byKey(const Key('segments'));
        final trackFinder = find
            .descendant(of: control, matching: find.byType(DecoratedBox))
            .first;
        final track = tester.getRect(trackFinder);
        final trackRadius = _radiusOf(
          tester.widget<DecoratedBox>(trackFinder).decoration as BoxDecoration,
        );
        final faceFinder = find.descendant(
          of: control,
          matching: find.byWidgetPredicate(
            (widget) => widget is Container && widget.decoration != null,
          ),
        );
        expect(faceFinder, findsOneWidget);
        final face = tester.getRect(faceFinder);
        final faceRadius = _radiusOf(
          tester.widget<Container>(faceFinder).decoration! as BoxDecoration,
        );

        const padding = AppSegmentedControl.trackPadding;
        // The face fills one tap target and never the parent's height.
        if (textScale == 1) expect(face.height, kAppMinTapTarget);
        // An equal gap on every side of the selected face.
        expect(face.top - track.top, closeTo(padding, 0.01));
        expect(track.bottom - face.bottom, closeTo(padding, 0.01));
        expect(face.left - track.left, closeTo(padding, 0.01));
        // Concentric corners: inner radius = outer radius - padding.
        expect(
          _paintedRadius(face, faceRadius),
          closeTo(_paintedRadius(track, trackRadius) - padding, 0.01),
        );
        expect(tester.takeException(), isNull);
      });
    }
  }

  test('selectedRadius insets the track radius and keeps pills', () {
    expect(
      AppSegmentedControl.selectedRadius(8),
      8 - AppSegmentedControl.trackPadding,
    );
    expect(AppSegmentedControl.selectedRadius(AppRadius.pill), AppRadius.pill);
  });
}
