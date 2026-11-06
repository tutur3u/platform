import 'package:flutter/material.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_time_axis.dart';

class ChartTableData {
  ChartTableData({
    required List<String> headers,
    required List<List<String>> rows,
  }) : assert(
         rows.every((row) => row.length == headers.length),
         'Each row must match the table headers',
       ),
       headers = List.unmodifiable(headers),
       rows = List.unmodifiable(rows.map(List<String>.unmodifiable));

  /// Uses the original filtered points, never the drawing envelope.
  factory ChartTableData.fromSeries(
    List<ChartSeries> series,
    ChartLabels labels, {
    String Function(double)? formatValue,
  }) {
    final times =
        series.expand((s) => s.points.map((p) => p.t)).toSet().toList()..sort();
    final byTime = [
      for (final s in series) {for (final p in s.points) p.t: p},
    ];
    return ChartTableData(
      headers: [
        labels.time,
        for (final s in series)
          '${s.label}${s.unit.isEmpty ? '' : ' (${s.unit})'}',
      ],
      rows: [
        for (final t in times)
          [
            '${chartTimeLabel(t, date: true)} GMT+7',
            for (var i = 0; i < series.length; i++)
              if (byTime[i][t]?.y == null)
                labels.unavailable
              else
                formatValue?.call(byTime[i][t]!.y!) ?? '${byTime[i][t]!.y}',
          ],
      ],
    );
  }
  final List<String> headers;
  final List<List<String>> rows;
}

/// A lazy row primitive is also exposed for chart detail slivers.
class ChartTable extends StatelessWidget {
  const ChartTable({required this.data, super.key});
  final ChartTableData data;
  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      for (var i = 0; i < data.rows.length; i++)
        ChartTableRow(data: data, index: i),
    ],
  );
}

class ChartTableRow extends StatelessWidget {
  const ChartTableRow({required this.data, required this.index, super.key});
  final ChartTableData data;
  final int index;
  @override
  Widget build(BuildContext context) {
    final palette = AppChartPalette.of(context);
    final stacked =
        MediaQuery.textScalerOf(context).scale(14) >= 28 ||
        data.headers.length > 3;
    final values = data.rows[index];
    Widget cell(int i) => Semantics(
      label: '${data.headers[i]}: ${values[i]}',
      child: ExcludeSemantics(
        child: Text(
          '${data.headers[i]}: ${values[i]}',
          style: TextStyle(color: palette.text),
        ),
      ),
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: palette.grid)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: stacked
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [for (var i = 0; i < values.length; i++) cell(i)],
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < values.length; i++)
                    Expanded(child: cell(i)),
                ],
              ),
      ),
    );
  }
}
