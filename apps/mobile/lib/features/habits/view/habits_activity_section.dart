import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/features/habits/view/habits_page_chrome.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class HabitsActivitySection extends StatelessWidget {
  const HabitsActivitySection({
    required this.state,
    required this.onOpenTracker,
    super.key,
  });

  final HabitsState state;
  final Future<void> Function(String trackerId) onOpenTracker;

  @override
  Widget build(BuildContext context) {
    if (state.activityStatus == HabitsStatus.loading &&
        state.activityEntries.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: AppLoadingIndicator(),
      );
    }

    if (state.activityStatus == HabitsStatus.error &&
        state.activityEntries.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: HabitsErrorView(error: state.activityError),
      );
    }

    if (state.trackers.isEmpty) {
      return Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(
          context.l10n.habitsActivityNoTrackers,
          textAlign: TextAlign.center,
        ),
      );
    }

    if (state.activityEntries.isEmpty) {
      return AppStateMessage(
        icon: LucideIcons.history,
        title: context.l10n.habitsActivityEmptyTitle,
        message: context.l10n.habitsActivityEmptyBody,
      );
    }

    final groups = _buildGroups(state.activityEntries);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (state.isActivityRefreshing)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: const NovaLoadingIndicator(size: 20),
            ),
          ),
        for (final group in groups)
          AppGroupedSection.spaced(
            caption: _formatGroupLabel(context, group.date),
            children: [
              for (final item in group.items)
                PendingSyncFrame(
                  key: ValueKey(item.entry.id),
                  workspaceId: item.tracker.wsId,
                  feature: 'habits',
                  entityId: item.entry.id,
                  child: _ActivityEntryCard(
                    item: item,
                    onTap: () => onOpenTracker(item.tracker.id),
                  ),
                ),
            ],
          ),
      ],
    );
  }

  String _formatGroupLabel(BuildContext context, DateTime date) {
    final locale = Localizations.localeOf(context).toLanguageTag();
    return DateFormat.yMMMMEEEEd(locale).format(date);
  }
}

class _ActivityEntryCard extends StatelessWidget {
  const _ActivityEntryCard({required this.item, required this.onTap});

  final HabitActivityEntry item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tracker = item.tracker;
    final entry = item.entry;
    final timestamp = item.timestamp.toLocal();
    final locale = Localizations.localeOf(context).toLanguageTag();
    final timeLabel = DateFormat.Hm(locale).format(timestamp);
    final primaryField = primaryFieldForTracker(tracker);
    final primaryValue = primaryField == null
        ? null
        : entry.values[primaryField.key];
    final fieldValues = tracker.inputSchema
        .where((field) => entry.values.containsKey(field.key))
        .where((field) => field.key != primaryField?.key)
        .toList(growable: false);

    final member = entry.member?.label;
    return AppGroupedRow(
      leading: AppIconTile(
        icon: habitTrackerIcon(tracker.icon),
        tone: AppTone.primary,
      ),
      title: Text(tracker.name),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: AppSpacing.sm,
            children: [if (member != null) Text(member), Text(timeLabel)],
          ),
          if (primaryField != null && primaryValue != null)
            Wrap(
              spacing: AppSpacing.sm,
              children: [
                Text(primaryField.label),
                Text(formatFieldValue(primaryField, primaryValue)),
              ],
            ),
          for (final field in fieldValues)
            Text(
              '${field.label} · '
              '${formatFieldValue(field, entry.values[field.key])}',
            ),
          if (entry.note?.trim() case final note? when note.isNotEmpty)
            Text(note),
          if (entry.tags.isNotEmpty)
            Text(entry.tags.map((tag) => '#$tag').join(' ')),
        ],
      ),
      onTap: onTap,
      showChevron: true,
    );
  }
}

class _ActivityGroup {
  const _ActivityGroup({required this.date, required this.items});

  final DateTime date;
  final List<HabitActivityEntry> items;
}

List<_ActivityGroup> _buildGroups(List<HabitActivityEntry> items) {
  final groups = <_ActivityGroup>[];
  DateTime? currentDate;
  var currentItems = <HabitActivityEntry>[];

  for (final item in items) {
    final timestamp = item.timestamp.toLocal();
    final date = DateTime(timestamp.year, timestamp.month, timestamp.day);
    if (currentDate == null || currentDate != date) {
      if (currentDate != null) {
        groups.add(_ActivityGroup(date: currentDate, items: currentItems));
      }
      currentDate = date;
      currentItems = [item];
      continue;
    }
    currentItems.add(item);
  }

  if (currentDate != null) {
    groups.add(_ActivityGroup(date: currentDate, items: currentItems));
  }

  return groups;
}
