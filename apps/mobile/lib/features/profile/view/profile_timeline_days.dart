import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
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
    this.firstHeader = false,
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

  /// The first day header of the list sits flush with the content top.
  final bool firstHeader;

  /// Where a single-item row sits in its day's card. Rows of one day stack
  /// into one rounded card: the first rounds its top, the last its bottom.
  /// Null draws the rows without a card.
  final ProfileTimelineSegment? segment;

  static double _line(BuildContext context, TextStyle style) => TextPainter(
    text: TextSpan(text: 'Mg', style: style),
    textDirection: Directionality.of(context),
    textScaler: MediaQuery.textScalerOf(context),
  ).preferredLineHeight;

  /// Height of a day header node, matching [AppSectionHeader] at this scale.
  static double headerExtent(BuildContext context, {required bool first}) {
    final type = AppTokens.of(context).typography;
    final title = _line(context, type.large.copyWith(height: 1.25));
    // A pixel of slack absorbs rounding at large text scales.
    return ((first ? 0 : AppLayout.sectionGap) + title + AppSpacing.md + 1)
        .ceilToDouble();
  }

  /// Height of one activity row: one title line and, for titled items, the
  /// kind as a single supporting line.
  static double rowExtent(BuildContext context, ProfileTimelineItem item) {
    final type = AppTokens.of(context).typography;
    final title = _line(context, type.base.copyWith(height: 1.3));
    final subtitle = _hasTitle(item)
        ? AppSpacing.xxs + _line(context, type.small.copyWith(height: 1.35))
        : 0;
    return math
        // One pixel for the card divider and one of rounding slack.
        .max(AppLayout.rowMinHeight, AppSpacing.md * 2 + title + subtitle + 2)
        .ceilToDouble();
  }

  static bool _hasTitle(ProfileTimelineItem item) =>
      item.title?.trim().isNotEmpty ?? false;

  @override
  Widget build(BuildContext context) {
    final groups = groupProfileTimelineDays(items, convertDate: convertDate);
    final locale = Localizations.localeOf(context).toString();
    final localNow = now ?? DateTime.now();
    final date = convertDate?.call(localNow) ?? localNow.toLocal();
    final today = DateTime(date.year, date.month, date.day);
    // Calendar arithmetic remains correct across daylight-saving boundaries.
    final yesterday = DateTime(today.year, today.month, today.day - 1);
    String time(ProfileTimelineItem item) => DateFormat.jm(
      locale,
    ).format(convertDate?.call(item.createdAt) ?? item.createdAt.toLocal());
    String dayLabel(DateTime day) => day == today
        ? context.l10n.profileTimelineToday
        : day == yesterday
        ? context.l10n.profileTimelineYesterday
        : DateFormat.MMMEd(locale).format(day);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisAlignment: showHeader && !showItems
          ? MainAxisAlignment.end
          : MainAxisAlignment.start,
      children: [
        for (final entry in groups.entries) ...[
          if (showHeader)
            AppSectionHeader(
              title: dayLabel(entry.key),
              count: entry.value.length,
              padding: EdgeInsets.only(
                top: firstHeader || showItems ? 0 : AppLayout.sectionGap,
                bottom: AppSpacing.md,
              ),
            ),
          for (final item in showItems ? entry.value : <ProfileTimelineItem>[])
            _segmented(context, _row(context, item, time(item))),
        ],
      ],
    );
  }

  Widget _row(BuildContext context, ProfileTimelineItem item, String time) {
    final kind = _kind(context, item);
    final title = _hasTitle(item) ? item.title!.trim() : kind;
    return AppGroupedRow(
      key: itemKey?.call(item),
      semanticLabel: [title, if (_hasTitle(item)) kind, time].join(', '),
      leading: AppIconTile(icon: _icon(item.type), tone: _tone(item.type)),
      title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: _hasTitle(item)
          ? Text(kind, maxLines: 1, overflow: TextOverflow.ellipsis)
          : null,
      trailing: Text(
        time,
        style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
      ),
      showChevron: _canOpen(item),
      onTap: _canOpen(item) ? () => onOpen(item) : null,
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

  /// What the activity is. Calendar rows have no reliable creator, so they
  /// read as workspace events rather than something the user added.
  String _kind(BuildContext context, ProfileTimelineItem item) =>
      switch (item.type) {
        'task' => context.l10n.profileTimelineKindTask,
        'transaction' => context.l10n.profileTimelineKindTransaction,
        'note' => context.l10n.profileTimelineKindNote,
        'calendar' => context.l10n.profileTimelineKindWorkspaceEvent,
        _ => context.l10n.profileTimelineTitle,
      };

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
