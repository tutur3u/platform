import 'package:flutter/widgets.dart';

/// Content-sized columns that adapt to the available window width.
/// Each column flows independently so short cards do not create empty rows.
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

  @override
  Widget build(BuildContext context) => SliverLayoutBuilder(
    builder: (context, constraints) {
      final columns = (constraints.crossAxisExtent / minColumnWidth)
          .floor()
          .clamp(1, maxColumns);
      return SliverToBoxAdapter(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (leading != null) ...[leading!, SizedBox(height: spacing)],
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var column = 0; column < columns; column++) ...[
                  if (column > 0) SizedBox(width: spacing),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (
                          var index = column;
                          index < children.length;
                          index += columns
                        )
                          Padding(
                            padding: EdgeInsets.only(bottom: spacing),
                            child: children[index],
                          ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      );
    },
  );
}
