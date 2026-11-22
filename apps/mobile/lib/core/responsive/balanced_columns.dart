import 'dart:math' as math;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

/// Lays [children] out in [columns] equal-width columns, placing each child,
/// in order, at the bottom of the currently shortest column.
///
/// Unlike a fixed `index % columns` flow, short cards do not leave one column
/// much taller than the others, so wide screens stay balanced. Ties go to the
/// leading column, which keeps reading order close to the list order.
class BalancedColumns extends MultiChildRenderObjectWidget {
  const BalancedColumns({
    required this.columns,
    required super.children,
    this.spacing = 0,
    this.runSpacing = 0,
    super.key,
  }) : assert(columns > 0, 'BalancedColumns needs at least one column');

  final int columns;

  /// Horizontal gap between columns.
  final double spacing;

  /// Vertical gap between cards in one column.
  final double runSpacing;

  @override
  RenderBalancedColumns createRenderObject(BuildContext context) =>
      RenderBalancedColumns(
        columns: columns,
        spacing: spacing,
        runSpacing: runSpacing,
        textDirection: Directionality.of(context),
      );

  @override
  void updateRenderObject(
    BuildContext context,
    RenderBalancedColumns renderObject,
  ) {
    renderObject
      ..columns = columns
      ..spacing = spacing
      ..runSpacing = runSpacing
      ..textDirection = Directionality.of(context);
  }
}

class _BalancedColumnsParentData extends ContainerBoxParentData<RenderBox> {}

class RenderBalancedColumns extends RenderBox
    with
        ContainerRenderObjectMixin<RenderBox, _BalancedColumnsParentData>,
        RenderBoxContainerDefaultsMixin<RenderBox, _BalancedColumnsParentData> {
  RenderBalancedColumns({
    required int columns,
    required double spacing,
    required double runSpacing,
    required TextDirection textDirection,
  }) : _columns = columns,
       _spacing = spacing,
       _runSpacing = runSpacing,
       _textDirection = textDirection;

  int _columns;
  int get columns => _columns;
  set columns(int value) {
    if (value == _columns) return;
    _columns = value;
    markNeedsLayout();
  }

  double _spacing;
  double get spacing => _spacing;
  set spacing(double value) {
    if (value == _spacing) return;
    _spacing = value;
    markNeedsLayout();
  }

  double _runSpacing;
  double get runSpacing => _runSpacing;
  set runSpacing(double value) {
    if (value == _runSpacing) return;
    _runSpacing = value;
    markNeedsLayout();
  }

  TextDirection _textDirection;
  TextDirection get textDirection => _textDirection;
  set textDirection(TextDirection value) {
    if (value == _textDirection) return;
    _textDirection = value;
    markNeedsLayout();
  }

  @override
  void setupParentData(RenderBox child) {
    if (child.parentData is! _BalancedColumnsParentData) {
      child.parentData = _BalancedColumnsParentData();
    }
  }

  double _columnWidth(double width) =>
      math.max(0, (width - spacing * (columns - 1)) / columns);

  @override
  double computeMinIntrinsicWidth(double height) {
    var widest = 0.0;
    for (var child = firstChild; child != null; child = childAfter(child)) {
      widest = math.max(widest, child.getMinIntrinsicWidth(double.infinity));
    }
    return widest * columns + spacing * (columns - 1);
  }

  @override
  double computeMaxIntrinsicWidth(double height) =>
      computeMinIntrinsicWidth(height);

  @override
  double computeMinIntrinsicHeight(double width) => _placeHeights(
    _columnWidth(width),
    (child, columnWidth) => child.getMinIntrinsicHeight(columnWidth),
  );

  @override
  double computeMaxIntrinsicHeight(double width) => _placeHeights(
    _columnWidth(width),
    (child, columnWidth) => child.getMaxIntrinsicHeight(columnWidth),
  );

  /// Height of the tallest column when each child takes [measure]'s height.
  double _placeHeights(
    double columnWidth,
    double Function(RenderBox child, double columnWidth) measure,
  ) {
    final heights = List<double>.filled(columns, 0);
    final used = List<bool>.filled(columns, false);
    for (var child = firstChild; child != null; child = childAfter(child)) {
      final column = _shortest(heights);
      if (used[column]) heights[column] += runSpacing;
      heights[column] += measure(child, columnWidth);
      used[column] = true;
    }
    return heights.fold(0, math.max);
  }

  static int _shortest(List<double> heights) {
    var best = 0;
    for (var index = 1; index < heights.length; index++) {
      // Strictly shorter, so ties stay in the leading column.
      if (heights[index] < heights[best] - 0.5) best = index;
    }
    return best;
  }

  @override
  Size computeDryLayout(covariant BoxConstraints constraints) {
    final columnWidth = _columnWidth(constraints.maxWidth);
    final height = _placeHeights(
      columnWidth,
      (child, width) =>
          child.getDryLayout(BoxConstraints.tightFor(width: width)).height,
    );
    return constraints.constrain(Size(constraints.maxWidth, height));
  }

  @override
  void performLayout() {
    final width = constraints.maxWidth;
    final columnWidth = _columnWidth(width);
    final heights = List<double>.filled(columns, 0);
    final used = List<bool>.filled(columns, false);
    final rtl = textDirection == TextDirection.rtl;
    for (var child = firstChild; child != null; child = childAfter(child)) {
      child.layout(
        BoxConstraints.tightFor(width: columnWidth),
        parentUsesSize: true,
      );
      final column = _shortest(heights);
      if (used[column]) heights[column] += runSpacing;
      final start = column * (columnWidth + spacing);
      final dx = rtl ? width - start - columnWidth : start;
      (child.parentData! as _BalancedColumnsParentData).offset = Offset(
        dx,
        heights[column],
      );
      heights[column] += child.size.height;
      used[column] = true;
    }
    size = constraints.constrain(Size(width, heights.fold(0, math.max)));
  }

  @override
  void paint(PaintingContext context, Offset offset) =>
      defaultPaint(context, offset);

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) =>
      defaultHitTestChildren(result, position: position);
}
