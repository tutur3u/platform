import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

class RecordedRule {
  const RecordedRule(this.start, this.end, this.color, this.width);
  final Offset start;
  final Offset end;
  final Color color;
  final double width;
}

class RecordedLabel {
  RecordedLabel(ui.Paragraph paragraph, Offset offset)
    : rect = offset & Size(paragraph.longestLine, paragraph.height),
      lines = paragraph.computeLineMetrics().length;
  final Rect rect;
  final int lines;
}

class ChartRecordingCanvas implements Canvas {
  final rules = <RecordedRule>[];
  final paths = <(Rect, Color)>[];
  final labels = <RecordedLabel>[];

  @override
  void drawLine(Offset start, Offset end, Paint paint) =>
      rules.add(RecordedRule(start, end, paint.color, paint.strokeWidth));

  @override
  void drawPath(Path path, Paint paint) =>
      paths.add((path.getBounds(), paint.color));

  @override
  void drawParagraph(ui.Paragraph paragraph, Offset offset) =>
      labels.add(RecordedLabel(paragraph, offset));

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
