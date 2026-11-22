import 'package:flutter/widgets.dart';
import 'package:mobile/core/responsive/balanced_columns.dart';

/// Content-sized columns that adapt to the available window width.
///
/// Each card goes to the shortest column ([BalancedColumns]), so short cards
/// neither create empty rows nor leave one side of a wide screen empty.
/// [spacing] separates cards; nothing is added after the last card, so the
/// page's scroll end gap stays the only trailing space.
class SliverResponsiveCards extends StatelessWidget {
  const SliverResponsiveCards({
    required this.children,
    this.leading,
    this.minColumnWidth = 270,
    this.maxColumns = 3,
    this.spacing = 14,
    super.key,
  });

  final List<Widget> children;
  final Widget? leading;
  final double minColumnWidth;
  final int maxColumns;
  final double spacing;

  /// Columns of at least [minColumnWidth] that fit [width] with [spacing]
  /// between them, between 1 and [maxColumns].
  static int columnsFor(
    double width, {
    required double minColumnWidth,
    required double spacing,
    required int maxColumns,
  }) => ((width + spacing) / (minColumnWidth + spacing)).floor().clamp(
    1,
    maxColumns,
  );

  @override
  Widget build(BuildContext context) => SliverLayoutBuilder(
    builder: (context, constraints) {
      final columns = columnsFor(
        constraints.crossAxisExtent,
        minColumnWidth: minColumnWidth,
        spacing: spacing,
        maxColumns: maxColumns,
      );
      return SliverToBoxAdapter(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (leading != null) ...[leading!, SizedBox(height: spacing)],
            BalancedColumns(
              columns: columns,
              spacing: spacing,
              runSpacing: spacing,
              children: children,
            ),
          ],
        ),
      );
    },
  );
}
