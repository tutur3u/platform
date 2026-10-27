import 'dart:math' as math;

class ChartValueAxis {
  const ChartValueAxis({
    required this.min,
    required this.max,
    this.unit = '',
    this.formatValue,
  }) : assert(max > min, 'The axis must have a positive span');
  factory ChartValueAxis.auto(Iterable<double?> values, {bool signed = false}) {
    final known = values.whereType<double>().where((v) => v.isFinite);
    final min = signed ? known.fold<double>(0, math.min) : 0.0;
    final max = known.fold<double>(0, math.max);
    return ChartValueAxis(min: min, max: max == min ? min + 1 : max);
  }
  static const percent = ChartValueAxis(min: 0, max: 100);
  final double min;
  final double max;
  final String unit;
  final String Function(double)? formatValue;
  double fraction(double value) => (value - min) / (max - min);
  String label(double value) {
    final formatted = formatValue?.call(value);
    if (formatted != null) return formatted;
    final number = value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toStringAsFixed(1);
    return '$number${unit.isEmpty ? '' : ' $unit'}';
  }
}
