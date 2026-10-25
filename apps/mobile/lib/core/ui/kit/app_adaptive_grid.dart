import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout_tokens.dart';

/// Lays tiles out in as many equal columns as fit [minTileWidth], capped at
/// [maxColumns]: two stat tiles on a phone, three or four on a tablet and
/// more on a desktop, without per-screen breakpoints.
///
/// Rows are built eagerly, so use this for summaries and small collections
/// (dozens of tiles). Long collections should use [SliverAppAdaptiveGrid].
class AppAdaptiveGrid extends StatelessWidget {
  const AppAdaptiveGrid({
    required this.children,
    this.minTileWidth = 160,
    this.maxColumns = 4,
    this.spacing = AppLayout.itemGap,
    this.runSpacing = AppLayout.itemGap,
    this.equalHeight = false,
    super.key,
  });

  final List<Widget> children;
  final double minTileWidth;
  final int maxColumns;
  final double spacing;
  final double runSpacing;

  /// Stretches tiles in a row to the tallest one. This measures each row
  /// intrinsically, so keep it for short summaries.
  final bool equalHeight;

  /// Number of columns for [width]; always at least one.
  static int columnsFor(
    double width, {
    double minTileWidth = 160,
    int maxColumns = 4,
    double spacing = AppLayout.itemGap,
  }) {
    if (!width.isFinite || width <= 0) return 1;
    final fit = ((width + spacing) / (minTileWidth + spacing)).floor();
    return math.max(1, math.min(maxColumns, fit));
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final columns = columnsFor(
        constraints.maxWidth,
        minTileWidth: minTileWidth,
        maxColumns: maxColumns,
        spacing: spacing,
      );
      final rows = <Widget>[];
      for (var start = 0; start < children.length; start += columns) {
        final row = Row(
          crossAxisAlignment: equalHeight
              ? CrossAxisAlignment.stretch
              : CrossAxisAlignment.start,
          children: [
            for (var column = 0; column < columns; column++) ...[
              if (column > 0) SizedBox(width: spacing),
              Expanded(
                child: start + column < children.length
                    ? children[start + column]
                    : const SizedBox.shrink(),
              ),
            ],
          ],
        );
        if (rows.isNotEmpty) rows.add(SizedBox(height: runSpacing));
        rows.add(equalHeight ? IntrinsicHeight(child: row) : row);
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: rows,
      );
    },
  );
}

/// Lazily built grid of fixed-height tiles whose column count follows the
/// available width, like [AppAdaptiveGrid]. Use it for drives, galleries,
/// product catalogues and other long collections.
class SliverAppAdaptiveGrid extends StatelessWidget {
  const SliverAppAdaptiveGrid({
    required this.itemCount,
    required this.itemBuilder,
    required this.tileHeight,
    this.minTileWidth = 160,
    this.maxColumns = 6,
    this.spacing = AppLayout.itemGap,
    this.runSpacing = AppLayout.itemGap,
    super.key,
  });

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;

  /// Fixed main-axis extent. Scale it with text when tiles hold text, for
  /// example `MediaQuery.textScalerOf(context).scale(96)`.
  final double tileHeight;
  final double minTileWidth;
  final int maxColumns;
  final double spacing;
  final double runSpacing;

  @override
  Widget build(BuildContext context) => SliverLayoutBuilder(
    builder: (context, constraints) => SliverGrid(
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: AppAdaptiveGrid.columnsFor(
          constraints.crossAxisExtent,
          minTileWidth: minTileWidth,
          maxColumns: maxColumns,
          spacing: spacing,
        ),
        mainAxisExtent: tileHeight,
        crossAxisSpacing: spacing,
        mainAxisSpacing: runSpacing,
      ),
      delegate: SliverChildBuilderDelegate(
        (context, index) => RepaintBoundary(child: itemBuilder(context, index)),
        childCount: itemCount,
        addRepaintBoundaries: false,
      ),
    ),
  );
}
