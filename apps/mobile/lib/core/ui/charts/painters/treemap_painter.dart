import 'dart:math' as math;
import 'package:flutter/rendering.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_patterns.dart';
import 'package:mobile/core/ui/charts/painters/chart_canvas.dart';

/// Squarified rectangles in input order, with area proportional to tile weight.
List<Rect> chartTreemapRects(List<ChartTile> tiles, Rect bounds) {
  final total = tiles.fold<double>(0, (a, b) => a + math.max(0, b.value));
  if (total <= 0 || bounds.isEmpty) return List.filled(tiles.length, Rect.zero);
  final areas = tiles
      .map((t) => math.max(0, t.value) / total * bounds.width * bounds.height)
      .toList();
  final result = List<Rect>.filled(tiles.length, Rect.zero);
  var remaining = bounds;
  var index = 0;
  double worst(List<double> row, double side) {
    final sum = row.fold<double>(0, (a, b) => a + b);
    if (sum == 0 || row.contains(0)) return double.infinity;
    return math.max(
      side * side * row.reduce(math.max) / (sum * sum),
      sum * sum / (side * side * row.reduce(math.min)),
    );
  }

  while (index < areas.length && !remaining.isEmpty) {
    if (areas[index] == 0) {
      index++;
      continue;
    }
    final side = math.min(remaining.width, remaining.height);
    final row = <double>[areas[index]];
    var end = index + 1;
    while (end < areas.length &&
        areas[end] > 0 &&
        worst([...row, areas[end]], side) <= worst(row, side)) {
      row.add(areas[end++]);
    }
    final sum = row.fold<double>(0, (a, b) => a + b);
    final thick = sum / side;
    var cursor = remaining.width >= remaining.height
        ? remaining.top
        : remaining.left;
    for (var k = 0; k < row.length; k++) {
      final length = row[k] / thick;
      result[index + k] = remaining.width >= remaining.height
          ? Rect.fromLTWH(remaining.left, cursor, thick, length)
          : Rect.fromLTWH(cursor, remaining.top, length, thick);
      cursor += length;
    }
    remaining = remaining.width >= remaining.height
        ? Rect.fromLTRB(
            remaining.left + thick,
            remaining.top,
            remaining.right,
            remaining.bottom,
          )
        : Rect.fromLTRB(
            remaining.left,
            remaining.top + thick,
            remaining.right,
            remaining.bottom,
          );
    index = end;
  }
  return result;
}

class TreemapPainter extends ChartPainter {
  const TreemapPainter({
    required this.tiles,
    required this.palette,
    this.selectedTile,
    this.textScaler = TextScaler.noScaling,
  });
  final List<ChartTile> tiles;
  final AppChartPalette palette;
  final int? selectedTile;
  final TextScaler textScaler;

  @override
  SemanticsBuilderCallback get semanticsBuilder => (size) {
    final c = ChartCanvas(size, palette, axes: false);
    final rects = chartTreemapRects(tiles, c.plot);
    return [
      for (var i = 0; i < tiles.length; i++)
        if (!rects[i].isEmpty)
          CustomPainterSemantics(
            rect: rects[i],
            properties: SemanticsProperties(
              label: tiles[i].label,
              textDirection: TextDirection.ltr,
            ),
          ),
    ];
  };

  @override
  void paint(Canvas canvas, Size size) {
    final c = ChartCanvas(size, palette, axes: false, textScaler: textScaler);
    final rects = chartTreemapRects(tiles, c.plot);
    for (var i = 0; i < tiles.length; i++) {
      final rect = rects[i].deflate(2);
      if (rect.isEmpty) continue;
      final tile = tiles[i];
      final color = palette.slots[tile.slot];
      canvas.drawRect(rect, Paint()..color = color.withValues(alpha: 0.18));
      chartHatch(canvas, Path()..addRect(rect), rect, color, tile.pattern);
      canvas.drawRect(
        rect,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = i == selectedTile ? 3 : 1,
      );
      if (rect.width >= textScaler.scale(32) &&
          rect.height >= textScaler.scale(24)) {
        canvas
          ..save()
          ..clipRect(rect.deflate(3));
        c.label(
          canvas,
          tile.label,
          rect.topLeft + const Offset(4, 4),
          maxWidth: rect.width - 8,
        );
        canvas.restore();
      }
    }
  }
}
