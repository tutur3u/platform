import 'package:flutter/painting.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';

void chartMarker(
  Canvas canvas,
  Offset center,
  ChartMarker marker,
  Color color, {
  double size = 8,
  bool hollow = false,
  bool selected = false,
  Color? surface,
}) {
  final r = size / 2;
  final rect = Rect.fromCircle(center: center, radius: r);
  final path = Path();
  switch (marker) {
    case ChartMarker.circle:
      path.addOval(rect);
    case ChartMarker.square:
      path.addRect(rect);
    case ChartMarker.diamond:
      path
        ..moveTo(center.dx, center.dy - r)
        ..lineTo(center.dx + r, center.dy)
        ..lineTo(center.dx, center.dy + r)
        ..lineTo(center.dx - r, center.dy)
        ..close();
    case ChartMarker.triangleUp:
    case ChartMarker.triangleDown:
      final sign = marker == ChartMarker.triangleUp ? 1 : -1;
      path
        ..moveTo(center.dx, center.dy - r * sign)
        ..lineTo(center.dx + r, center.dy + r * sign)
        ..lineTo(center.dx - r, center.dy + r * sign)
        ..close();
  }
  if (hollow && surface != null) {
    canvas.drawPath(path, Paint()..color = surface);
  }
  canvas.drawPath(
    path,
    Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = hollow ? PaintingStyle.stroke : PaintingStyle.fill,
  );
  if (selected) {
    canvas.drawCircle(
      center,
      r + 3,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }
}
