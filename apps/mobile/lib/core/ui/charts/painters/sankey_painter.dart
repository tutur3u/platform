import 'dart:math' as math;
import 'package:flutter/painting.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_markers.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/painters/chart_canvas.dart';

class SankeyPainter extends ChartPainter {
  const SankeyPainter({
    required this.flows,
    required this.roles,
    required this.palette,
    this.selectedFlow,
    this.textScaler = TextScaler.noScaling,
  }) : assert(roles.length == 5, 'Five fixed public roles are required');
  final List<ChartFlow> flows;
  final List<String> roles;
  final AppChartPalette palette;
  final int? selectedFlow;
  final TextScaler textScaler;

  @override
  void paint(Canvas canvas, Size size) {
    final incoming = List<double>.filled(5, 0);
    final outgoing = List<double>.filled(5, 0);
    for (final f in flows) {
      outgoing[f.sender] += f.value;
      incoming[f.receiver] += f.value;
    }
    final total = outgoing.fold<double>(0, (a, b) => a + b);
    if (total <= 0) return;
    final c = ChartCanvas(size, palette, textScaler: textScaler);
    final top = textScaler.scale(22);
    final available = (size.height - top - 40).clamp(1.0, double.infinity);
    final scale = available / total;
    List<double> starts(List<double> values) {
      var y = top;
      return values.map((v) {
        final start = y;
        y += v * scale + 8;
        return start;
      }).toList();
    }

    final left = starts(outgoing);
    final right = starts(incoming);
    final leftCursor = List<double>.of(left);
    final rightCursor = List<double>.of(right);
    final x0 = size.width * 0.27;
    final x1 = size.width * 0.73;
    final mid = (x0 + x1) / 2;
    for (var i = 0; i < flows.length; i++) {
      final f = flows[i];
      if (f.value <= 0) continue;
      final a = leftCursor[f.sender];
      final b = rightCursor[f.receiver];
      final width = f.value * scale;
      final path = Path()
        ..moveTo(x0, a)
        ..cubicTo(mid, a, mid, b, x1, b)
        ..lineTo(x1, b + width)
        ..cubicTo(mid, b + width, mid, a + width, x0, a + width)
        ..close();
      canvas
        ..drawPath(
          path,
          Paint()..color = palette.slots[f.sender].withValues(alpha: 0.4),
        )
        ..drawPath(
          path,
          Paint()
            ..color = palette.slots[f.sender]
            ..style = PaintingStyle.stroke
            ..strokeWidth = i == selectedFlow ? 3 : 1,
        );
      final arrow = Path()
        ..moveTo(x1 - 8, b + width / 2 - math.min(4, width / 2))
        ..lineTo(x1 - 2, b + width / 2)
        ..lineTo(x1 - 8, b + width / 2 + math.min(4, width / 2));
      canvas.drawPath(
        arrow,
        Paint()
          ..color = palette.neutral
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      leftCursor[f.sender] += width;
      rightCursor[f.receiver] += width;
    }
    for (var i = 0; i < 5; i++) {
      for (final side in [false, true]) {
        final ys = side ? right : left;
        final values = side ? incoming : outgoing;
        if (values[i] <= 0) continue;
        final x = side ? x1 : x0 - 6;
        canvas.drawRect(
          Rect.fromLTWH(x, ys[i], 6, values[i] * scale),
          Paint()..color = palette.slots[i],
        );
        c.label(
          canvas,
          roles[i],
          Offset(side ? x + 10 : 0, ys[i]),
          maxWidth: x0 - 12,
        );
        chartMarker(
          canvas,
          Offset(side ? x + 9 : x - 9, ys[i] + 6),
          ChartMarker.values[i],
          palette.neutral,
          size: 6,
        );
      }
    }
  }
}
