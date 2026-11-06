import 'package:flutter/material.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/widgets/chart_legend.dart';
import 'package:mobile/core/ui/charts/widgets/chart_table.dart';
import 'package:mobile/core/ui/kit/app_panel.dart';

class ChartPanel extends StatelessWidget {
  const ChartPanel({
    required this.summary,
    required this.table,
    required this.tableLabel,
    required this.onTable,
    this.plot,
    this.readout,
    this.series = const [],
    this.coverageNote,
    super.key,
  });
  final String summary;
  final ChartTableData table;
  final String tableLabel;
  final ValueChanged<ChartTableData> onTable;
  final Widget? plot;
  final Widget? readout;
  final List<ChartSeries> series;
  final String? coverageNote;
  @override
  Widget build(BuildContext context) {
    final palette = AppChartPalette.of(context);
    return AppPanel(
      child: DefaultTextStyle.merge(
        style: TextStyle(color: palette.text),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(summary),
            if (coverageNote != null)
              Text(coverageNote!, style: TextStyle(color: palette.mutedText)),
            if (plot != null) plot!,
            ChartLegend(series: series),
            if (readout != null) readout!,
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton(
                onPressed: () => onTable(table),
                child: Text(tableLabel, style: TextStyle(color: palette.text)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
