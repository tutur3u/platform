import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// The same slot is reserved in both modes so content never moves vertically.
class ProfileTimelineDateStrip extends StatelessWidget {
  const ProfileTimelineDateStrip({
    required this.open,
    required this.selected,
    required this.week,
    required this.activityDays,
    required this.onToggle,
    required this.onSelect,
    required this.onWeek,
    required this.onToday,
    super.key,
  });

  final bool open;
  final DateTime selected;
  final DateTime week;
  final Set<DateTime> activityDays;
  final VoidCallback onToggle;
  final VoidCallback onToday;
  final ValueChanged<DateTime> onSelect;
  final ValueChanged<int> onWeek;

  static double slotHeight(BuildContext context) =>
      88 * MediaQuery.textScalerOf(context).scale(14) / 14;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final locale = Localizations.localeOf(context).toString();
    final l10n = context.l10n;
    final weekEnd = DateTime(week.year, week.month, week.day + 7);
    final headerDate =
        open && (selected.isBefore(week) || !selected.isBefore(weekEnd))
        ? week
        : selected;
    return Column(
      children: [
        SizedBox(
          height: 48,
          child: Row(
            children: [
              IconButton(
                key: const ValueKey('timeline-date-toggle'),
                tooltip: open
                    ? l10n.profileTimelineHideDates
                    : l10n.profileTimelineShowDates,
                onPressed: onToggle,
                icon: Icon(
                  open ? Icons.view_agenda_outlined : Icons.date_range,
                ),
              ),
              Expanded(
                child: Text(
                  DateFormat.yMMM(locale).format(headerDate),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.base,
                ),
              ),
              IconButton(
                tooltip: l10n.profileTimelineToday,
                onPressed: onToday,
                icon: const Icon(Icons.today_outlined),
              ),
              if (open) ...[
                IconButton(
                  tooltip: MaterialLocalizations.of(
                    context,
                  ).previousPageTooltip,
                  onPressed: () => onWeek(-1),
                  icon: const Icon(Icons.chevron_left),
                ),
                IconButton(
                  tooltip: MaterialLocalizations.of(context).nextPageTooltip,
                  onPressed: () => onWeek(1),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ],
          ),
        ),
        SizedBox(
          key: const ValueKey('timeline-date-slot'),
          height: slotHeight(context),
          child: open
              ? _TimelineWeek(
                  selected: selected,
                  week: week,
                  activityDays: activityDays,
                  onSelect: onSelect,
                )
              : Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    l10n.profileTimelineAgenda,
                    style: theme.typography.large.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

class _TimelineWeek extends StatefulWidget {
  const _TimelineWeek({
    required this.selected,
    required this.week,
    required this.activityDays,
    required this.onSelect,
  });
  final DateTime selected;
  final DateTime week;
  final Set<DateTime> activityDays;
  final ValueChanged<DateTime> onSelect;
  @override
  State<_TimelineWeek> createState() => _TimelineWeekState();
}

class _TimelineWeekState extends State<_TimelineWeek> {
  final _scroll = ScrollController();
  bool _pending = false;
  bool _weekChanged = false;
  double? _width;
  double? _scale;

  void _reveal() {
    if (_pending) return;
    _pending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _pending = false;
      if (!mounted || !_scroll.hasClients) return;
      // UTC date carriers compare calendar days without DST-length arithmetic.
      final day = DateTime.utc(
        widget.selected.year,
        widget.selected.month,
        widget.selected.day,
      );
      final start = DateTime.utc(
        widget.week.year,
        widget.week.month,
        widget.week.day,
      );
      final index = day.difference(start).inDays;
      if (index < 0 || index > 6) {
        if (_weekChanged) _scroll.jumpTo(0);
      } else {
        final width = 56 * (_scale ?? 1);
        final left = index * width;
        final right = left + width;
        final position = _scroll.position;
        if (left < position.pixels ||
            right > position.pixels + position.viewportDimension) {
          final target = (left + width / 2 - position.viewportDimension / 2)
              .clamp(0.0, position.maxScrollExtent);
          _scroll.jumpTo(target);
        }
      }
      _weekChanged = false;
    });
  }

  @override
  void didUpdateWidget(covariant _TimelineWeek oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.week != oldWidget.week ||
        widget.selected != oldWidget.selected) {
      _weekChanged = _weekChanged || widget.week != oldWidget.week;
      _reveal();
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final locale = Localizations.localeOf(context).toString();
    final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
    final l10n = context.l10n;
    return LayoutBuilder(
      builder: (context, constraints) {
        if (_width != constraints.maxWidth || _scale != scale) {
          _width = constraints.maxWidth;
          _scale = scale;
          _reveal();
        }
        return ListView.builder(
          key: const ValueKey('timeline-week-scroll'),
          controller: _scroll,
          scrollDirection: Axis.horizontal,
          itemCount: 7,
          itemBuilder: (context, index) {
            final date = DateTime(
              widget.week.year,
              widget.week.month,
              widget.week.day + index,
            );
            final active = widget.activityDays.contains(date);
            final isSelected = date == widget.selected;
            final activityLabel = active
                ? ', ${l10n.profileTimelineHasActivity}'
                : '';
            return SizedBox(
              width: 56 * scale,
              child: Semantics(
                selected: isSelected,
                button: true,
                onTap: () => widget.onSelect(date),
                label:
                    '${DateFormat.yMMMEd(locale).format(date)}'
                    '$activityLabel',
                child: ExcludeSemantics(
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      key: ValueKey('timeline-date-${date.toIso8601String()}'),
                      borderRadius: BorderRadius.circular(24),
                      onTap: () => widget.onSelect(date),
                      child: Column(
                        children: [
                          Text(
                            DateFormat.E(locale).format(date),
                            style: theme.typography.textSmall,
                          ),
                          const SizedBox(height: 4),
                          Container(
                            width: 44 * scale,
                            height: 44 * scale,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isSelected
                                  ? theme.colorScheme.primary
                                  : theme.colorScheme.card,
                              border: Border.all(
                                color: theme.colorScheme.border,
                              ),
                            ),
                            child: Text(
                              '${date.day}',
                              style: theme.typography.base.copyWith(
                                color: isSelected
                                    ? theme.colorScheme.primaryForeground
                                    : theme.colorScheme.foreground,
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          if (active)
                            Container(
                              width: 4,
                              height: 4,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: theme.colorScheme.primary,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}
