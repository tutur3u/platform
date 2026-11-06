import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_markers.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_patterns.dart';

enum ChartStatus { short, ok, surplus, unknown, critical, high, medium, low }

class StatusGlyph extends StatelessWidget {
  const StatusGlyph({required this.status, required this.label, super.key});
  final ChartStatus status;
  final String label;
  @override
  Widget build(BuildContext context) {
    final palette = AppChartPalette.of(context);
    final (marker, tone) = switch (status) {
      ChartStatus.short => (ChartMarker.triangleDown, AppTone.destructive),
      ChartStatus.surplus => (ChartMarker.triangleUp, AppTone.info),
      ChartStatus.critical => (ChartMarker.diamond, AppTone.destructive),
      ChartStatus.high => (ChartMarker.triangleUp, AppTone.warning),
      ChartStatus.medium => (ChartMarker.square, AppTone.info),
      ChartStatus.ok ||
      ChartStatus.low ||
      ChartStatus.unknown => (ChartMarker.circle, AppTone.neutral),
    };
    return Semantics(
      label: label,
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CustomPaint(
              size: const Size(20, 20),
              painter: _StatusPainter(
                marker,
                palette.tone(tone),
                unknown: status == ChartStatus.unknown,
              ),
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(label, style: TextStyle(color: palette.text)),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusPainter extends CustomPainter {
  const _StatusPainter(this.marker, this.color, {required this.unknown});
  final ChartMarker marker;
  final Color color;
  final bool unknown;
  @override
  void paint(Canvas canvas, Size size) {
    if (unknown) {
      chartDashedPath(
        canvas,
        Path()..addOval(
          Rect.fromCircle(center: size.center(Offset.zero), radius: 5),
        ),
        Paint()
          ..color = color
          ..strokeWidth = 2
          ..style = PaintingStyle.stroke,
        dash: 3,
        gap: 2,
      );
    } else {
      chartMarker(canvas, size.center(Offset.zero), marker, color, size: 10);
    }
  }

  @override
  bool shouldRepaint(_StatusPainter old) =>
      marker != old.marker || color != old.color || unknown != old.unknown;
}
