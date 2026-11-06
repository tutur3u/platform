import 'package:flutter/widgets.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_time_axis.dart';
import 'package:mobile/core/ui/charts/widgets/chart_selection.dart';

String chartPointReadout(
  ChartPoint point,
  ChartSeries series,
  ChartLabels labels, {
  required bool last,
  String Function(double)? formatValue,
}) => [
  '${chartTimeLabel(point.t, date: true)} GMT+7',
  series.label,
  if (point.y == null)
    labels.unavailable
  else
    '${formatValue?.call(point.y!) ?? point.y} ${series.unit}'.trim(),
  if (series.coverage.isNotEmpty) series.coverage,
  if (point.partial || last) labels.partialBucket,
].join(' · ');

class ChartReadout extends StatelessWidget {
  const ChartReadout({
    required this.controller,
    required this.readout,
    this.empty = '',
    super.key,
  });
  final ChartSelectionController controller;
  final String Function(ChartSelection) readout;
  final String empty;
  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
    valueListenable: controller,
    builder: (context, selection, _) => Semantics(
      liveRegion: true,
      child: Text(
        selection == null ? empty : readout(selection),
        style: TextStyle(color: AppChartPalette.of(context).text),
      ),
    ),
  );
}
