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
    required this.viewportKey,
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
  final GlobalKey viewportKey;
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
      final rows = math.min(
        visibleMaxRow + 1,
        expanded ? visibleMaxRow + 1 : 2,
      );
      final hasSpans = layout.spans.isNotEmpty;
      final showToggle = visibleMaxRow >= 2;
      final toggleHeight = math.max<double>(
        48,
        MediaQuery.textScalerOf(
                  context,
                ).scale(theme.textTheme.labelLarge?.fontSize ?? 14) *
                1.4 +
            16,
      );
      final target = (
        rows: hasSpans ? _MultiDayAllDayRow.heightForRows(context, rows) : 0.0,
        toggle: showToggle ? toggleHeight : 0.0,
      );
      final reduced = MediaQuery.disableAnimationsOf(context);
      return TweenAnimationBuilder<_AllDayGeometry>(
        key: ValueKey((scope, reduced, _MultiDayAllDayRow.rowHeight(context))),
        tween: _AllDayGeometryTween(target),
        duration: reduced ? Duration.zero : const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        builder: (context, geometry, _) {
          if (!hasSpans && geometry.rows + geometry.toggle < 0.01) {
            return const SizedBox.shrink();
          }
          return Container(
            decoration: BoxDecoration(
              color: colorScheme.surfaceContainerLow,
              border: Border(
                bottom: BorderSide(
                  color: colorScheme.outlineVariant,
                  width: 0.6,
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: geometry.rows,
                  child: hasSpans
                      ? Stack(
                          children: [
                            SingleChildScrollView(
                              key: viewportKey,
                              controller: controller,
                              scrollDirection: Axis.horizontal,
                              physics: DateSnapScrollPhysics(
                                dayWidth: dayColumnWidth,
                              ),
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
                                  availableHeight: geometry.rows,
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
                                padding: const EdgeInsets.only(
                                  top: 10,
                                  right: 8,
                                ),
                                child:
                                    geometry.rows >=
                                        MediaQuery.textScalerOf(context).scale(
                                                  theme
                                                          .textTheme
                                                          .labelSmall
                                                          ?.fontSize ??
                                                      12,
                                                ) *
                                                1.2 +
                                            10
                                    ? Text(
                                        context.l10n.calendarAllDay,
                                        maxLines: 1,
                                        softWrap: false,
                                        overflow: TextOverflow.ellipsis,
                                        textAlign: TextAlign.right,
                                        style: theme.textTheme.labelSmall
                                            ?.copyWith(
                                              color:
                                                  colorScheme.onSurfaceVariant,
                                              fontWeight: FontWeight.w600,
                                            ),
                                      )
                                    : null,
                              ),
                            ),
                          ],
                        )
                      : null,
                ),
                SizedBox(
                  height: geometry.toggle,
                  child: showToggle && geometry.toggle >= toggleHeight - 0.01
                      ? TextButton.icon(
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
                        )
                      : null,
                ),
              ],
            ),
          );
        },
      );
    },
  );
}

typedef _AllDayGeometry = ({double rows, double toggle});

class _AllDayGeometryTween extends Tween<_AllDayGeometry> {
  _AllDayGeometryTween(_AllDayGeometry target)
    : super(begin: target, end: target);

  @override
  _AllDayGeometry lerp(double t) => (
    rows: begin!.rows + (end!.rows - begin!.rows) * t,
    toggle: begin!.toggle + (end!.toggle - begin!.toggle) * t,
  );
}
