import 'package:flutter/widgets.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_value_axis.dart';
import 'package:mobile/core/ui/charts/painters/line_painter.dart';

class Sparkline extends StatelessWidget {
  const Sparkline({
    required this.series,
    required this.summary,
    required this.axis,
    this.cadence,
    this.height = 44,
    super.key,
  });
  final ChartSeries series;
  final String summary;
  final ChartValueAxis axis;
  final Duration? cadence;
  final double height;
  @override
  Widget build(BuildContext context) => Semantics(
    label: summary,
    child: RepaintBoundary(
      child: CustomPaint(
        size: Size(double.infinity, height),
        painter: LinePainter(
          series: [series],
          palette: AppChartPalette.of(context),
          axis: axis,
          cadence: cadence,
          axes: false,
        ),
      ),
    ),
  );
}
