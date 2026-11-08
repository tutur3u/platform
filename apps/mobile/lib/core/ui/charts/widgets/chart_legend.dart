import 'package:flutter/widgets.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_markers.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_patterns.dart';

class ChartLegend extends StatelessWidget {
  const ChartLegend({required this.series, super.key});
  final List<ChartSeries> series;
  @override
  Widget build(BuildContext context) {
    if (series.length < 2) return const SizedBox.shrink();
    final palette = AppChartPalette.of(context);
    return Wrap(
      spacing: 16,
      runSpacing: 8,
      children: [
        for (final s in series)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ExcludeSemantics(
                child: CustomPaint(
                  size: const Size(28, 16),
                  painter: ChartSwatchPainter(s, palette),
                ),
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(s.label, style: TextStyle(color: palette.text)),
              ),
            ],
          ),
      ],
    );
  }
}

class ChartSwatchPainter extends CustomPainter {
  const ChartSwatchPainter(this.series, this.palette);
  final ChartSeries series;
  final AppChartPalette palette;
  @override
  void paint(Canvas canvas, Size size) {
    final color = series.tone == null
        ? palette.slots[series.slot]
        : palette.tone(series.tone!);
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final path = Path()
      ..moveTo(0, size.height / 2)
      ..lineTo(size.width, size.height / 2);
    if (series.style == ChartLineStyle.dashed) {
      chartDashedPath(canvas, path, paint);
    } else {
      canvas.drawPath(path, paint);
    }
    chartMarker(
      canvas,
      size.center(Offset.zero),
      series.marker,
      color,
      hollow: series.hollow,
      surface: palette.surface,
    );
  }

  @override
  bool shouldRepaint(ChartSwatchPainter old) =>
      old.series != series || old.palette != palette;
}
