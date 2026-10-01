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
    final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
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
              ? ListView.builder(
                  key: ValueKey(week),
                  scrollDirection: Axis.horizontal,
                  itemCount: 7,
                  itemBuilder: (context, index) {
                    final date = DateTime(
                      week.year,
                      week.month,
                      week.day + index,
                    );
                    final active = activityDays.contains(date);
                    final isSelected = date == selected;
                    final activityLabel = active
                        ? ', ${l10n.profileTimelineHasActivity}'
                        : '';
                    return SizedBox(
                      width: 56 * scale,
                      child: Semantics(
                        selected: isSelected,
                        button: true,
                        onTap: () => onSelect(date),
                        label:
                            '${DateFormat.yMMMEd(locale).format(date)}'
                            '$activityLabel',
                        child: ExcludeSemantics(
                          child: Material(
                            color: Colors.transparent,
                            child: InkWell(
                              key: ValueKey(
                                'timeline-date-${date.toIso8601String()}',
                              ),
                              borderRadius: BorderRadius.circular(24),
                              onTap: () => onSelect(date),
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
                                            ? theme
                                                  .colorScheme
                                                  .primaryForeground
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
