import 'package:flutter/foundation.dart';
import 'package:mobile/core/layout/grouped_rows.dart';

enum ChartLineStyle { solid, dashed, step }

enum ChartMarker { circle, triangleUp, triangleDown, diamond, square }

enum ChartPattern { none, forward, backward }

@immutable
class ChartPoint {
  const ChartPoint({required this.t, required this.y, this.partial = false});
  final DateTime t;
  final double? y;
  final bool partial;

  ChartPoint asPartial() => ChartPoint(t: t, y: y, partial: true);
}

@immutable
class ChartSeries {
  ChartSeries({
    required this.id,
    required this.label,
    required this.slot,
    required List<ChartPoint> points,
    this.style = ChartLineStyle.solid,
    this.marker = ChartMarker.circle,
    this.pattern = ChartPattern.none,
    this.tone,
    this.hollow = false,
    this.unit = '',
    this.coverage = '',
  }) : assert(slot >= 0 && slot < 6, 'Slots are fixed, never cycled'),
       points = List.unmodifiable(points);
  final String id;
  final String label;
  final int slot;
  final List<ChartPoint> points;
  final ChartLineStyle style;
  final ChartMarker marker;
  final ChartPattern pattern;
  final AppTone? tone;
  final bool hollow;
  final String unit;
  final String coverage;
}

@immutable
class ChartBand {
  const ChartBand({required this.label, this.t, this.y})
    : assert((t == null) != (y == null), 'A rule has exactly one axis');
  final String label;
  final DateTime? t;
  final double? y;
}

@immutable
class ChartCategoryValue {
  ChartCategoryValue({required this.label, required List<double?> values})
    : values = List.unmodifiable(values);
  final String label;
  final List<double?> values;
}

@immutable
class ChartCell {
  const ChartCell({this.value, this.outlined = false});
  final double? value;
  final bool outlined;
}

@immutable
class ChartMatrix {
  ChartMatrix({
    required List<String> columns,
    required List<String> rows,
    required List<List<ChartCell>> cells,
    Set<int> hatchedColumns = const {},
    Set<int> hatchedRows = const {},
  }) : assert(cells.length == rows.length, 'One cell row per row label'),
       assert(
         cells.every((row) => row.length == columns.length),
         'One cell per column label',
       ),
       columns = List.unmodifiable(columns),
       rows = List.unmodifiable(rows),
       cells = List.unmodifiable(cells.map(List<ChartCell>.unmodifiable)),
       hatchedColumns = Set.unmodifiable(hatchedColumns),
       hatchedRows = Set.unmodifiable(hatchedRows);
  final List<String> columns;
  final List<String> rows;
  final List<List<ChartCell>> cells;
  final Set<int> hatchedColumns;
  final Set<int> hatchedRows;

  ChartMatrix transpose() => ChartMatrix(
    columns: rows,
    rows: columns,
    cells: List.generate(
      columns.length,
      (x) => List.generate(rows.length, (y) => cells[y][x]),
    ),
    hatchedColumns: hatchedRows,
    hatchedRows: hatchedColumns,
  );
}

@immutable
class ChartFlow {
  const ChartFlow({
    required this.sender,
    required this.receiver,
    required this.value,
  });
  final int sender;
  final int receiver;
  final double value;
}

@immutable
class ChartTile {
  const ChartTile({
    required this.label,
    required this.value,
    required this.slot,
    this.pattern = ChartPattern.none,
  });
  final String label;
  final double value;
  final int slot;
  final ChartPattern pattern;
}

/// All prose is supplied by the owning app's localized templates.
@immutable
class ChartLabels {
  const ChartLabels({
    required this.unavailable,
    required this.partialBucket,
    required this.table,
    required this.time,
  });
  final String unavailable;
  final String partialBucket;
  final String table;
  final String time;
}
