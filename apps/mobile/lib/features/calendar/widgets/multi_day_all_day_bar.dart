part of 'multi_day_schedule_view.dart';

bool _allDaySpanVisible(
  AllDaySpan span, {
  required double gutterWidth,
  required double dayColumnWidth,
  required double viewportStart,
  required double viewportWidth,
}) =>
    gutterWidth + (span.endIndex + 1) * dayColumnWidth - 4 > viewportStart &&
    gutterWidth + span.startIndex * dayColumnWidth + 4 <
        viewportStart + viewportWidth;

class _MultiDayAllDayBar extends StatelessWidget {
  const _MultiDayAllDayBar({
    required this.layout,
    required this.controller,
    required this.scope,
    required this.gutterWidth,
    required this.dayColumnWidth,
    required this.contentWidth,
    required this.viewportWidth,
    required this.fallbackOffset,
    required this.expanded,
    required this.onToggle,
    required this.onEventTap,
  });

  final AllDayLayoutResult layout;
  final ScrollController controller;
  final Object? scope;
  final double gutterWidth;
  final double dayColumnWidth;
  final double contentWidth;
  final double viewportWidth;
  final double fallbackOffset;
  final bool expanded;
  final VoidCallback onToggle;
  final ValueChanged<CalendarEvent> onEventTap;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, _) {
      final theme = Theme.of(context);
      final colorScheme = theme.colorScheme;
      final viewportStart =
          (controller.hasClients ? controller.offset : fallbackOffset) +
          gutterWidth;
      final visibleMaxRow = layout.spans
          .where(
            (span) => _allDaySpanVisible(
              span,
              gutterWidth: gutterWidth,
              dayColumnWidth: dayColumnWidth,
              viewportStart: viewportStart,
              viewportWidth: viewportWidth - gutterWidth,
            ),
          )
          .fold<int>(-1, (row, span) => math.max(row, span.row));
      final viewportLayout = AllDayLayoutResult(
        spans: layout.spans,
        maxRow: visibleMaxRow,
      );
      return Container(
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerLow,
          border: Border(
            bottom: BorderSide(color: colorScheme.outlineVariant, width: 0.6),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                SingleChildScrollView(
                  controller: controller,
                  scrollDirection: Axis.horizontal,
                  physics: DateSnapScrollPhysics(dayWidth: dayColumnWidth),
                  child: SizedBox(
                    width: gutterWidth + contentWidth,
                    child: _MultiDayAllDayRow(
                      layout: viewportLayout,
                      scope: scope,
                      timeGutterWidth: gutterWidth,
                      dayColumnWidth: dayColumnWidth,
                      viewportStart: viewportStart,
                      viewportWidth: viewportWidth - gutterWidth,
                      maxVisibleRows: expanded ? null : 2,
                      onEventTap: onEventTap,
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  child: Container(
                    width: gutterWidth,
                    color: colorScheme.surfaceContainerLow,
                    padding: const EdgeInsets.only(top: 10, right: 8),
                    child: Text(
                      context.l10n.calendarAllDay,
                      maxLines: 1,
                      softWrap: false,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.right,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            if (visibleMaxRow >= 2)
              TextButton.icon(
                onPressed: onToggle,
                icon: Icon(
                  expanded
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  size: 18,
                ),
                label: Text(
                  expanded
                      ? context.l10n.commonShowLess
                      : context.l10n.commonShowMore,
                ),
              ),
          ],
        ),
      );
    },
  );
}
