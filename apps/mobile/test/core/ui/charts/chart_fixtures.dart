import 'package:flutter/rendering.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/ui/charts/charts.dart';

// Deliberately invented values and labels; no publisher samples are read.
final chartEpoch = DateTime.utc(2026, 1, 2, 16);
const chartLabels = ChartLabels(
  unavailable: 'Unavailable',
  partialBucket: 'partial bucket',
  table: 'Table',
  time: 'Time (GMT+7)',
);

List<ChartPoint> fixturePoints([
  List<double?> values = const [12, 18, null, 4, 14, 9],
]) => [
  for (var i = 0; i < values.length; i++)
    ChartPoint(
      t: chartEpoch.add(Duration(hours: i)),
      y: values[i],
    ),
];

List<ChartSeries> fixtureSeries() => [
  ChartSeries(
    id: 'one',
    label: 'Synthetic A',
    slot: 0,
    points: fixturePoints(),
    unit: 'items',
    coverage: 'partial',
  ),
  ChartSeries(
    id: 'two',
    label: 'Synthetic B',
    slot: 1,
    style: ChartLineStyle.dashed,
    pattern: ChartPattern.forward,
    points: fixturePoints([3, 5, null, 6, 3, 5]),
    unit: 'items',
    coverage: 'partial',
  ),
  ChartSeries(
    id: 'unknown',
    label: 'Synthetic unknown',
    slot: 2,
    tone: AppTone.neutral,
    style: ChartLineStyle.dashed,
    pattern: ChartPattern.backward,
    points: fixturePoints([2, 1, null, 2, 1, 2]),
  ),
];

final fixtureMatrix = ChartMatrix(
  columns: const ['X', 'Y', 'Z'],
  rows: const ['A', 'B', 'C'],
  cells: const [
    [ChartCell(value: 0), ChartCell(), ChartCell(value: 9, outlined: true)],
    [ChartCell(value: 2), ChartCell(value: 4), ChartCell(value: 6)],
    [ChartCell(value: 1), ChartCell(value: 3), ChartCell(value: 8)],
  ],
  hatchedColumns: const {2},
);

const fixtureTiles = [
  ChartTile(label: 'Role A / Product X', value: 8, slot: 0),
  ChartTile(
    label: 'Role B / Product X',
    value: 5,
    slot: 1,
    pattern: ChartPattern.forward,
  ),
  ChartTile(
    label: 'Role C / Product Y',
    value: 3,
    slot: 2,
    pattern: ChartPattern.backward,
  ),
  ChartTile(
    label: 'Role D / Product Y',
    value: 1,
    slot: 3,
    pattern: ChartPattern.forward,
  ),
];

CustomPainter fixturePainter(
  String name,
  AppChartPalette palette,
  TextScaler scaler,
) {
  final series = fixtureSeries();
  const axis = ChartValueAxis(min: 0, max: 30);
  switch (name) {
    case 'line':
      return LinePainter(
        series: series,
        palette: palette,
        axis: axis,
        cadence: const Duration(hours: 1),
        textScaler: scaler,
        selectedBucket: 1,
        bands: [
          ChartBand(
            label: 'Reset GMT+7',
            t: chartEpoch.add(const Duration(hours: 4)),
          ),
        ],
      );
    case 'area':
      return StackedAreaPainter(
        series: series,
        palette: palette,
        axis: axis,
        cadence: const Duration(hours: 1),
        textScaler: scaler,
      );
    case 'stacked_bar':
    case 'horizontal_bar':
    case 'diverging_bar':
      return StackedBarPainter(
        series: series,
        palette: palette,
        axis: name == 'diverging_bar'
            ? const ChartValueAxis(min: -20, max: 30)
            : axis,
        horizontal: name == 'horizontal_bar',
        diverging: name == 'diverging_bar',
        categories: [
          ChartCategoryValue(label: 'A', values: const [10, 4, 2]),
          ChartCategoryValue(
            label: 'B',
            values: [if (name == 'diverging_bar') -14 else 14, 3, 1],
          ),
          ChartCategoryValue(label: 'C', values: const [null, null, null]),
        ],
        textScaler: scaler,
      );
    case 'heatmap':
      return HeatmapPainter(
        matrix: fixtureMatrix,
        palette: palette,
        textScaler: scaler,
      );
    case 'sankey':
      return SankeyPainter(
        palette: palette,
        textScaler: scaler,
        roles: const ['Lead', 'Product', 'Ops', 'Watch', 'User'],
        flows: const [
          ChartFlow(sender: 0, receiver: 1, value: 8),
          ChartFlow(sender: 1, receiver: 2, value: 4),
          ChartFlow(sender: 2, receiver: 4, value: 3),
          ChartFlow(sender: 3, receiver: 0, value: 2),
          ChartFlow(sender: 4, receiver: 3, value: 1),
        ],
      );
    case 'treemap':
      return TreemapPainter(
        tiles: fixtureTiles,
        palette: palette,
        textScaler: scaler,
      );
    case 'sparkline':
      return LinePainter(
        series: [series.first],
        palette: palette,
        axis: axis,
        axes: false,
        cadence: const Duration(hours: 1),
        textScaler: scaler,
      );
    default:
      throw ArgumentError.value(name);
  }
}
