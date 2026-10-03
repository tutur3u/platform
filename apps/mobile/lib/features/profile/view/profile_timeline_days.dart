import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    super.key,
  });

  final List<ProfileTimelineItem> items;
  final ValueChanged<ProfileTimelineItem> onOpen;
  final DateTime Function(DateTime)? convertDate;
  final DateTime? now;
  final Key Function(ProfileTimelineItem)? itemKey;

  @override
  Widget build(BuildContext context) {
    final groups = groupProfileTimelineDays(items, convertDate: convertDate);
    final theme = shad.Theme.of(context);
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
      children: [
        for (final entry in groups.entries) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
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
                        : DateFormat.yMMMd(locale).format(entry.key),
                    style: theme.typography.base.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const shad.Gap(4),
                  Text(
                    _summary(context, entry.value),
                    style: theme.typography.textSmall.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ),
          for (final item in entry.value)
            Material(
              color: Colors.transparent,
              child: ListTile(
                key: itemKey?.call(item),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
                leading: Icon(_icon(item.type), size: 22),
                title: Text(
                  item.title?.trim().isNotEmpty == true
                      ? item.title!.trim()
                      : _milestone(context, item),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(
                  item.title?.trim().isNotEmpty == true
                      ? '${_milestone(context, item)} · ${time(item)}'
                      : time(item),
                ),
                trailing: _canOpen(item)
                    ? const Icon(Icons.chevron_right_rounded, size: 18)
                    : null,
                onTap: _canOpen(item) ? () => onOpen(item) : null,
              ),
            ),
        ],
      ],
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
    'task' => Icons.task_alt_rounded,
    'transaction' => Icons.account_balance_wallet_outlined,
    'note' => Icons.edit_note_rounded,
    'calendar' => Icons.event_rounded,
    _ => Icons.history_rounded,
  };
}
