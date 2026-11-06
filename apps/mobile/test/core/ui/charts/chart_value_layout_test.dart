import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/charts/charts.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const size = Size(360, 220);
  const axes = [
    ChartValueAxis(min: -20, max: 30),
    ChartValueAxis(min: 0, max: 30),
    ChartValueAxis(min: -20, max: 0),
    ChartValueAxis(min: -1, max: 99),
    ChartValueAxis(min: -200000, max: 300000, unit: 'items'),
  ];
  for (final scale in [1.0, 2.0]) {
    for (final horizontal in [false, true]) {
      for (final axis in axes) {
        test('F3 measured labels ${axis.min}..${axis.max} '
            'scale=$scale horizontal=$horizontal', () {
          final layout = ChartValueLayout(
            size: size,
            axis: axis,
            color: const Color(0xFF000000),
            textScaler: TextScaler.linear(scale),
            horizontal: horizontal,
          );
          addTearDown(layout.dispose);
          expect(
            layout.ticks.map((t) => t.value),
            containsAll({axis.min, 0.0, axis.max}),
          );
          expect(layout.plot.left, greaterThanOrEqualTo(0));
          expect(layout.plot.right, lessThanOrEqualTo(size.width));
          if (!horizontal) {
            expect(layout.plot.left, lessThanOrEqualTo(size.width * 0.45 + 12));
          }
          for (final tick in layout.ticks) {
            expect(tick.painter.computeLineMetrics(), hasLength(1));
            expect(tick.painter.didExceedMaxLines, isFalse);
            expect(tick.rect.width, closeTo(tick.painter.width, 1e-6));
            expect(tick.rect.height, closeTo(tick.painter.height, 1e-6));
            expect(tick.rect.left, greaterThanOrEqualTo(0));
            expect(tick.rect.top, greaterThanOrEqualTo(0));
            expect(tick.rect.right, lessThanOrEqualTo(size.width));
            expect(tick.rect.bottom, lessThanOrEqualTo(size.height));
          }
          for (var i = 0; i < layout.ticks.length; i++) {
            for (var j = i + 1; j < layout.ticks.length; j++) {
              expect(
                layout.ticks[i].rect
                    .inflate(3)
                    .overlaps(layout.ticks[j].rect.inflate(3)),
                isFalse,
              );
            }
          }
        });
      }
    }
  }
}
