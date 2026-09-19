import 'package:flutter/widgets.dart';

/// Content-sized card rows that adapt to the space actually available.
/// Unlike fixed grid extents, longer translations and larger text can grow.
class SliverResponsiveCards extends StatelessWidget {
  const SliverResponsiveCards({
    required this.children,
    this.minColumnWidth = 360,
    this.maxColumns = 3,
    this.spacing = 14,
    super.key,
  });

  final List<Widget> children;
  final double minColumnWidth;
  final int maxColumns;
  final double spacing;

  @override
  Widget build(BuildContext context) => SliverLayoutBuilder(
    builder: (context, constraints) {
      final columns = (constraints.crossAxisExtent / minColumnWidth)
          .floor()
          .clamp(1, maxColumns);
      return SliverList.builder(
        itemCount: (children.length / columns).ceil(),
        itemBuilder: (context, row) => Padding(
          padding: EdgeInsets.only(bottom: spacing),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var column = 0; column < columns; column++) ...[
                if (column > 0) SizedBox(width: spacing),
                Expanded(
                  child: row * columns + column < children.length
                      ? children[row * columns + column]
                      : const SizedBox.shrink(),
                ),
              ],
            ],
          ),
        ),
      );
    },
  );
}
