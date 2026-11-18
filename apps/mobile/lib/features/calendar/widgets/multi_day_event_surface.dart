part of 'multi_day_schedule_view.dart';

class _ClassicEventCardSurface extends StatelessWidget {
  const _ClassicEventCardSurface({
    required this.event,
    required this.height,
    required this.onTap,
  });

  final CalendarEvent event;
  final double height;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accentColor = EventColors.inContext(event, context).accent;
    final foregroundColor = EventColors.inContext(event, context).foreground;
    final backgroundColor = EventColors.inContext(event, context).background;
    final start = event.startAt;
    final end = event.endAt ?? start;
    final lineHeight =
        MediaQuery.textScalerOf(
          context,
        ).scale(Theme.of(context).textTheme.labelMedium?.fontSize ?? 14) *
        1.1;
    final showTime =
        start != null && end != null && height >= lineHeight * 3 + 20;
    final verticalPadding = height < 36 ? 2.0 : 6.0;

    return Semantics(
      button: true,
      label: start == null || end == null
          ? event.title ?? ''
          : '${event.title ?? ''}, ${_formatTime(start)} – ${_formatTime(end)}',
      onTap: onTap,
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            margin: const EdgeInsets.only(right: 2, bottom: 2),
            padding: EdgeInsets.fromLTRB(
              8,
              verticalPadding,
              6,
              verticalPadding,
            ),
            decoration: BoxDecoration(
              color: backgroundColor,
              borderRadius: BorderRadius.circular(10),
              border: Border(left: BorderSide(color: accentColor, width: 3)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.03),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ClipRect(
              child: OverflowBox(
                alignment: Alignment.topLeft,
                minHeight: 0,
                maxHeight: double.infinity,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      event.title ?? '',
                      maxLines: showTime ? 2 : 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: foregroundColor,
                        fontWeight: FontWeight.w700,
                        height: 1.1,
                      ),
                    ),
                    if (showTime) ...[
                      const SizedBox(height: 4),
                      Text(
                        '${_formatTime(start)} - ${_formatTime(end)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: foregroundColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _formatTime(DateTime value) {
    final hour = value.hour;
    final minute = value.minute.toString().padLeft(2, '0');
    final period = hour >= 12 ? 'PM' : 'AM';
    final normalizedHour = hour == 0
        ? 12
        : hour > 12
        ? hour - 12
        : hour;
    return '$normalizedHour:$minute $period';
  }
}
