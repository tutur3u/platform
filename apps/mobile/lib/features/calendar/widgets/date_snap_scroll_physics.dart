import 'package:flutter/widgets.dart';

/// Settles a continuous date window at a day boundary without paging its data.
class DateSnapScrollPhysics extends ClampingScrollPhysics {
  const DateSnapScrollPhysics({required this.dayWidth, super.parent});

  final double dayWidth;

  @override
  DateSnapScrollPhysics applyTo(ScrollPhysics? ancestor) =>
      DateSnapScrollPhysics(dayWidth: dayWidth, parent: buildParent(ancestor));

  @override
  Simulation? createBallisticSimulation(
    ScrollMetrics position,
    double velocity,
  ) {
    if (dayWidth <= 0 || position.outOfRange) {
      return super.createBallisticSimulation(position, velocity);
    }
    final tolerance = toleranceFor(position);
    var day = position.pixels / dayWidth;
    if (velocity < -tolerance.velocity) {
      day -= 0.5;
    } else if (velocity > tolerance.velocity) {
      day += 0.5;
    }
    // A narrow viewport can leave a fractional day at the backing edge.
    // Clamp to available day boundaries, never the raw fractional extent.
    final firstDay = (position.minScrollExtent / dayWidth).ceil();
    final lastDay = (position.maxScrollExtent / dayWidth).floor();
    if (firstDay > lastDay) {
      return super.createBallisticSimulation(position, velocity);
    }
    final target = day.round().clamp(firstDay, lastDay) * dayWidth;
    if ((target - position.pixels).abs() < tolerance.distance) return null;
    return ScrollSpringSimulation(
      spring,
      position.pixels,
      target,
      velocity,
      tolerance: tolerance,
    );
  }
}
