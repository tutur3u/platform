import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/l10n/l10n.dart';

/// Vertically stacked colored chips for all-day events above the timeline.
///
/// Collapses to show the first 3 events with an expand toggle if there are
/// more.
class AllDayEventBar extends StatefulWidget {
  const AllDayEventBar({
    required this.events,
    required this.onEventTap,
    super.key,
  });

  final List<CalendarEvent> events;
  final ValueChanged<CalendarEvent> onEventTap;

  @override
  State<AllDayEventBar> createState() => _AllDayEventBarState();
}

class _AllDayEventBarState extends State<AllDayEventBar> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (widget.events.isEmpty) return const SizedBox.shrink();

    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;
    final shown = _expanded ? widget.events : widget.events.take(3).toList();
    final hasMore = widget.events.length > 3;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        border: Border(
          bottom: BorderSide(color: colorScheme.outlineVariant, width: 0.5),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            l10n.calendarAllDay,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          ...shown.map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: GestureDetector(
                onTap: () => widget.onEventTap(e),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: EventColors.background(e.color),
                    borderRadius: BorderRadius.circular(4),
                    border: Border(
                      left: BorderSide(
                        color: EventColors.fromString(e.color),
                        width: 3,
                      ),
                    ),
                  ),
                  child: Text(
                    e.title ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: EventColors.bright(e.color),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (hasMore)
            GestureDetector(
              onTap: () => setState(() => _expanded = !_expanded),
              child: Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  _expanded
                      ? '- Show less'
                      : '+${widget.events.length - 3} more',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: colorScheme.primary,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
