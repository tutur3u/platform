import 'package:flutter/widgets.dart';

@immutable
class ChartSelection {
  const ChartSelection({required this.bucket, this.series = 0});
  final int bucket;
  final int series;
  @override
  bool operator ==(Object other) =>
      other is ChartSelection &&
      other.bucket == bucket &&
      other.series == series;
  @override
  int get hashCode => Object.hash(bucket, series);
}

class ChartSelectionController extends ValueNotifier<ChartSelection?> {
  ChartSelectionController() : super(null);
  void select(int bucket, {int series = 0}) =>
      value = ChartSelection(bucket: bucket, series: series);
  void clear() => value = null;
  void step(int delta, int buckets) {
    if (buckets <= 0) return;
    select(
      value == null
          ? (delta < 0 ? buckets - 1 : 0)
          : (value!.bucket + delta).clamp(0, buckets - 1),
      series: value?.series ?? 0,
    );
  }

  void cycle(int delta, int seriesCount) {
    if (seriesCount <= 0) return;
    select(
      value?.bucket ?? 0,
      series: ((value?.series ?? 0) + delta) % seriesCount,
    );
  }
}

class ChartStepIntent extends Intent {
  const ChartStepIntent(this.delta);
  final int delta;
}

class ChartSeriesIntent extends Intent {
  const ChartSeriesIntent(this.delta);
  final int delta;
}

class ChartClearIntent extends Intent {
  const ChartClearIntent();
}
