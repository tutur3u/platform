import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Date controls reserve a stable slot when their inline toggle is visible.
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
    this.showToggle = true,
    super.key,
  });

  final bool open;
  final bool showToggle;
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
    if (!open && !showToggle) {
      return const Column(
        children: [SizedBox(height: 0, key: ValueKey('timeline-date-slot'))],
      );
    }
    final tokens = AppTokens.of(context);
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
              if (showToggle)
                AppIconButton(
                  key: const ValueKey('timeline-date-toggle'),
                  tooltip: open
                      ? l10n.profileTimelineHideDates
                      : l10n.profileTimelineShowDates,
                  onPressed: onToggle,
                  icon: Icon(
                    open ? LucideIcons.rows3 : LucideIcons.calendarRange,
                  ),
                ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsetsDirectional.only(
                    start: AppSpacing.xs,
                  ),
                  child: Text(
                    DateFormat.yMMMM(locale).format(headerDate),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.base.copyWith(
                      color: tokens.colorScheme.foreground,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              AppIconButton(
                tooltip: l10n.profileTimelineToday,
                onPressed: onToday,
                icon: const Icon(LucideIcons.calendarCheck),
              ),
              if (open) ...[
                AppIconButton(
                  tooltip: MaterialLocalizations.of(
                    context,
                  ).previousPageTooltip,
                  onPressed: () => onWeek(-1),
                  icon: const Icon(LucideIcons.chevronLeft),
                ),
                AppIconButton(
                  tooltip: MaterialLocalizations.of(context).nextPageTooltip,
                  onPressed: () => onWeek(1),
                  icon: const Icon(LucideIcons.chevronRight),
                ),
              ],
            ],
          ),
        ),
        SizedBox(
          key: const ValueKey('timeline-date-slot'),
          height: open || showToggle ? slotHeight(context) : 0,
          child: open
              ? _TimelineWeek(
                  selected: selected,
                  week: week,
                  activityDays: activityDays,
                  onSelect: onSelect,
                )
              : showToggle
              ? Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    l10n.profileTimelineAgenda,
                    style: tokens.typography.large.copyWith(
                      color: tokens.colorScheme.foreground,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                )
              : const SizedBox.shrink(),
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
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
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
                            style: tokens.typography.xSmall.copyWith(
                              color: isSelected
                                  ? c.foreground
                                  : c.mutedForeground,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            width: 44 * scale,
                            height: 44 * scale,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(
                                AppRadius.sm * scale,
                              ),
                              color: isSelected
                                  ? c.primary
                                  : active
                                  ? AppTone.primary.fill(c)
                                  : c.card.withValues(alpha: 0.6),
                              border: Border.all(
                                color: isSelected
                                    ? c.primary
                                    : c.border.withValues(alpha: 0.7),
                              ),
                            ),
                            child: Text(
                              '${date.day}',
                              style: tokens.typography.base.copyWith(
                                color: isSelected
                                    ? c.primaryForeground
                                    : c.foreground,
                                fontWeight: FontWeight.w600,
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
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
                                color: c.primary,
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
