import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_patterns.dart';
import 'package:mobile/core/ui/charts/painters/chart_canvas.dart';

class HeatmapPainter extends ChartPainter {
  const HeatmapPainter({
    required this.matrix,
    required this.palette,
    this.security = false,
    this.selectedRow,
    this.selectedColumn,
    this.textScaler = TextScaler.noScaling,
  });
  final ChartMatrix matrix;
  final AppChartPalette palette;
  final bool security;
  final int? selectedRow;
  final int? selectedColumn;
  final TextScaler textScaler;

  Rect cellRect(Size size, int row, int column) {
    final left = (size.width * 0.27).clamp(32.0, 110.0);
    final top = textScaler.scale(24) + 8;
    final width = (size.width - left - 8) / matrix.columns.length;
    final height = (size.height - top - 8) / matrix.rows.length;
    return Rect.fromLTWH(
      left + column * width,
      top + row * height,
      width,
      height,
    ).deflate(2);
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (matrix.rows.isEmpty || matrix.columns.isEmpty) return;
    final c = ChartCanvas(size, palette, textScaler: textScaler);
    final max = matrix.cells
        .expand((row) => row)
        .map((v) => v.value ?? 0)
        .fold<double>(1, math.max);
    final end = security ? palette.destructive : palette.slots[0];
    for (var y = 0; y < matrix.rows.length; y++) {
      final rowRect = cellRect(size, y, 0);
      c.label(
        canvas,
        matrix.rows[y],
        Offset(0, rowRect.top),
        maxWidth: rowRect.left - 6,
      );
      if (matrix.hatchedRows.contains(y)) {
        chartHatch(
          canvas,
          Path()..addRect(
            Rect.fromLTRB(0, rowRect.top, rowRect.left - 4, rowRect.bottom),
          ),
          Rect.fromLTRB(0, rowRect.top, rowRect.left - 4, rowRect.bottom),
          palette.neutral,
          ChartPattern.forward,
        );
      }
      for (var x = 0; x < matrix.columns.length; x++) {
        final rect = cellRect(size, y, x);
        final cell = matrix.cells[y][x];
        if (y == 0) {
          final header = Rect.fromLTWH(
            rect.left,
            0,
            rect.width,
            rowRect.top - 4,
          );
          if (matrix.hatchedColumns.contains(x)) {
            chartHatch(
              canvas,
              Path()..addRect(header),
              header,
              palette.grid,
              ChartPattern.forward,
            );
          }
          c.label(
            canvas,
            matrix.columns[x],
            header.topLeft,
            maxWidth: rect.width,
          );
        }
        if (cell.value == null) {
          chartDashedPath(
            canvas,
            Path()..addRect(rect),
            Paint()
              ..color = palette.neutral
              ..style = PaintingStyle.stroke,
          );
          continue;
        }
        final step = ((cell.value! / max).clamp(0.0, 1.0) * 4).round();
        final fill = Color.lerp(palette.surface, end, 0.08 + step * 0.23)!;
        canvas.drawRect(rect, Paint()..color = fill);
        if (cell.outlined || (y == selectedRow && x == selectedColumn)) {
          canvas.drawRect(
            rect,
            Paint()
              ..color = palette.neutral
              ..strokeWidth = 2
              ..style = PaintingStyle.stroke,
          );
        }
        final text = AppearanceContrast.ensureContrast(
          palette.text,
          against: fill,
          target: AppearanceContrast.aaText,
        );
        canvas
          ..save()
          ..clipRect(rect);
        c.label(
          canvas,
          cell.value!.toStringAsFixed(0),
          rect.topLeft + const Offset(2, 1),
          maxWidth: rect.width - 4,
          color: text,
        );
        canvas.restore();
      }
    }
  }
}
