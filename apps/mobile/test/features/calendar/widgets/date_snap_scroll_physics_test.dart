import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/widgets/date_snap_scroll_physics.dart';

void main() {
  ScrollMetrics metrics(double pixels) => FixedScrollMetrics(
    minScrollExtent: 0,
    maxScrollExtent: 2100,
    pixels: pixels,
    viewportDimension: 336,
    axisDirection: AxisDirection.right,
    devicePixelRatio: 1,
  );
  const physics = DateSnapScrollPhysics(dayWidth: 112);
  for (final entry in [
    (817.0, 0.0, 784.0),
    (855.0, 0.0, 896.0),
    (817.0, 900.0, 896.0),
    (817.0, -900.0, 784.0),
  ]) {
    test('settles ${entry.$1} velocity ${entry.$2} at ${entry.$3}', () {
      final simulation = physics.createBallisticSimulation(
        metrics(entry.$1),
        entry.$2,
      )!;
      expect(simulation.x(10), closeTo(entry.$3, 0.01));
    });
  }
  test('aligned pixels stay idle', () {
    expect(physics.createBallisticSimulation(metrics(784), 0), isNull);
  });
  test('parent application preserves day geometry', () {
    expect(physics.applyTo(const ClampingScrollPhysics()).dayWidth, 112);
  });
  test('fractional backing-window extent still settles on a day', () {
    final simulation = physics.createBallisticSimulation(metrics(2100), 900);
    expect(simulation, isNotNull);
    expect(simulation!.x(10), closeTo(2016, 0.01));
    final approaching = physics.createBallisticSimulation(metrics(2050), 900)!;
    expect(approaching.x(10), closeTo(2016, 0.01));
  });
}
