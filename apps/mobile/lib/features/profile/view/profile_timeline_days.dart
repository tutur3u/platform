import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/l10n/l10n.dart';

/// A row's place in its day card; see [ProfileTimelineDays.segment].
typedef ProfileTimelineSegment = ({bool first, bool last});

/// Sort snapshots as well as API results; cache order is not an API guarantee.
Map<DateTime, List<ProfileTimelineItem>> groupProfileTimelineDays(
  List<ProfileTimelineItem> items, {
  DateTime Function(DateTime)? convertDate,
}) {
  final sorted = [...items]
    ..sort((a, b) {
      final order = b.createdAt.compareTo(a.createdAt);
      return order != 0
          ? order
          : '${a.type}:${a.id}'.compareTo('${b.type}:${b.id}');
    });
  final days = <DateTime, List<ProfileTimelineItem>>{};
  for (final item in sorted) {
    final date = convertDate?.call(item.createdAt) ?? item.createdAt.toLocal();
    final day = DateTime(date.year, date.month, date.day);
    days.putIfAbsent(day, () => []).add(item);
  }
  return days;
}

class ProfileTimelineDays extends StatelessWidget {
  const ProfileTimelineDays({
    required this.items,
    required this.onOpen,
    this.convertDate,
    this.now,
    this.itemKey,
    this.showHeader = true,
    this.showItems = true,
    this.segment,
    super.key,
  });

  final List<ProfileTimelineItem> items;
  final ValueChanged<ProfileTimelineItem> onOpen;
  final DateTime Function(DateTime)? convertDate;
  final DateTime? now;
  final Key Function(ProfileTimelineItem)? itemKey;
  final bool showHeader;
  final bool showItems;

  /// Where a single-item row sits in its day's card. Rows of one day stack
  /// into one rounded card: the first rounds its top, the last its bottom.
  /// Null draws the rows without a card.
  final ProfileTimelineSegment? segment;

  @override
  Widget build(BuildContext context) {
    final groups = groupProfileTimelineDays(items, convertDate: convertDate);
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final locale = Localizations.localeOf(context).toString();
    final localNow = now ?? DateTime.now();
    final date = convertDate?.call(localNow) ?? localNow.toLocal();
    final today = DateTime(date.year, date.month, date.day);
    // Calendar arithmetic remains correct across daylight-saving boundaries.
    final yesterday = DateTime(today.year, today.month, today.day - 1);
    String time(ProfileTimelineItem item) => DateFormat.jm(
      locale,
    ).format(convertDate?.call(item.createdAt) ?? item.createdAt.toLocal());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisAlignment: showHeader && !showItems
          ? MainAxisAlignment.end
          : MainAxisAlignment.start,
      children: [
        for (final entry in groups.entries) ...[
          if (showHeader)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xs,
                AppSpacing.md,
                AppSpacing.xs,
                AppSpacing.sm,
              ),
              child: Semantics(
                header: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.key == today
                          ? context.l10n.profileTimelineToday
                          : entry.key == yesterday
                          ? context.l10n.profileTimelineYesterday
                          : DateFormat.yMMMEd(locale).format(entry.key),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.base.copyWith(
                        color: c.foreground,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      _summary(context, entry.value),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.xSmall.copyWith(
                        color: c.mutedForeground,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          for (final item in showItems ? entry.value : <ProfileTimelineItem>[])
            _segmented(
              context,
              AppGroupedRow(
                key: itemKey?.call(item),
                leading: AppIconTile(
                  icon: _icon(item.type),
                  tone: _tone(item.type),
                ),
                title: Text(
                  item.title?.trim().isNotEmpty == true
                      ? item.title!.trim()
                      : _milestone(context, item),
                ),
                subtitle: Text(
                  item.title?.trim().isNotEmpty == true
                      ? '${_milestone(context, item)} · ${time(item)}'
                      : time(item),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                showChevron: _canOpen(item),
                onTap: _canOpen(item) ? () => onOpen(item) : null,
              ),
            ),
        ],
      ],
    );
  }

  /// Wraps a row in its slice of the day card so consecutive fixed-extent
  /// rows read as one grouped card.
  Widget _segmented(BuildContext context, Widget row) {
    final segment = this.segment;
    if (segment == null) {
      return Material(type: MaterialType.transparency, child: row);
    }
    final colors = Theme.of(context).colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    const radius = Radius.circular(AppRadius.card);
    final border = BorderSide(
      color: colors.outlineVariant.withValues(alpha: solid ? 1 : 0.4),
    );
    final shape = BorderRadius.vertical(
      top: segment.first ? radius : Radius.zero,
      bottom: segment.last ? radius : Radius.zero,
    );
    return Expanded(
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface.withValues(alpha: solid ? 1 : 0.72),
          borderRadius: shape,
          border: Border(
            left: border,
            right: border,
            top: segment.first ? border : BorderSide.none,
            bottom: segment.last ? border : BorderSide.none,
          ),
        ),
        child: ClipRRect(
          borderRadius: shape,
          child: Material(
            type: MaterialType.transparency,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!segment.first)
                  Divider(
                    height: 1,
                    thickness: 0.5,
                    indent: AppLayout.rowDividerInset,
                    color: colors.outlineVariant.withValues(alpha: 0.6),
                  ),
                Expanded(child: Center(child: row)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  bool _canOpen(ProfileTimelineItem item) =>
      const {'task', 'transaction', 'note', 'calendar'}.contains(item.type);

  String _milestone(
    BuildContext context,
    ProfileTimelineItem item,
  ) => switch (item.type) {
    'task' => context.l10n.profileTimelineTasks(1),
    'transaction' => context.l10n.profileTimelineTransactions(1),
    'note' => context.l10n.profileTimelineNotes(1),
    // Creation is not attributed to the user: the source has no creator field.
    'calendar' => context.l10n.profileTimelineWorkspaceEvents(1),
    _ => context.l10n.profileTimelineTitle,
  };

  String _summary(BuildContext context, List<ProfileTimelineItem> items) {
    final counts = <String, int>{};
    for (final item in items) {
      counts.update(item.type, (count) => count + 1, ifAbsent: () => 1);
    }
    final l10n = context.l10n;
    return [
      if (counts['task'] case final count?) l10n.profileTimelineTasks(count),
      if (counts['transaction'] case final count?)
        l10n.profileTimelineTransactions(count),
      if (counts['note'] case final count?) l10n.profileTimelineNotes(count),
      if (counts['calendar'] case final count?)
        l10n.profileTimelineWorkspaceEvents(count),
    ].join(' · ');
  }

  IconData _icon(String type) => switch (type) {
    'task' => LucideIcons.circleCheck,
    'transaction' => LucideIcons.wallet,
    'note' => LucideIcons.notebookPen,
    'calendar' => LucideIcons.calendarDays,
    _ => LucideIcons.history,
  };

  // Each source keeps its app's tone (see the mobile design language).
  AppTone _tone(String type) => switch (type) {
    'task' => AppTone.primary,
    'transaction' => AppTone.success,
    'note' => AppTone.warning,
    'calendar' => AppTone.info,
    _ => AppTone.neutral,
  };
}
