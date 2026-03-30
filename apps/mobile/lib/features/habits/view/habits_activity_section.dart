import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/features/habits/view/habits_page_chrome.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

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
        child: Center(child: NovaLoadingIndicator()),
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
      return _ActivityEmptyState(message: context.l10n.habitsActivityEmptyBody);
    }

    final groups = _buildGroups(state.activityEntries);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (state.activityStatus == HabitsStatus.loading)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: const LinearProgressIndicator(minHeight: 4),
            ),
          ),
        for (final group in groups) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
            child: Text(
              _formatGroupLabel(context, group.date),
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          for (final item in group.items) ...[
            _ActivityEntryCard(
              item: item,
              onTap: () => onOpenTracker(item.tracker.id),
            ),
            if (item != group.items.last) const SizedBox(height: 10),
          ],
          if (group != groups.last) const SizedBox(height: 18),
        ],
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
    final accentColor = habitTrackerColor(context, tracker.color);
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

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            gradient: LinearGradient(
              colors: [
                accentColor.withValues(alpha: 0.12),
                Theme.of(context).colorScheme.surfaceContainerLow,
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            border: Border.all(
              color: accentColor.withValues(alpha: 0.22),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: accentColor.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      habitTrackerIcon(tracker.icon),
                      color: accentColor,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tracker.name,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          entry.member?.label ?? entry.entryDate,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface.withValues(
                        alpha: 0.92,
                      ),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      timeLabel,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              if (primaryField != null && primaryValue != null) ...[
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface.withValues(
                      alpha: 0.86,
                    ),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          primaryField.label,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ),
                      Text(
                        formatFieldValue(primaryField, primaryValue),
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (fieldValues.isNotEmpty) ...[
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: fieldValues
                      .map(
                        (field) => _ValueChip(
                          label: field.label,
                          value: formatFieldValue(
                            field,
                            entry.values[field.key],
                          ),
                        ),
                      )
                      .toList(growable: false),
                ),
              ],
              if (entry.note?.trim().isNotEmpty == true) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(13),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface.withValues(
                      alpha: 0.55,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    entry.note!.trim(),
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ],
              if (entry.tags.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: entry.tags
                      .map(
                        (tag) => Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: Theme.of(
                              context,
                            ).colorScheme.surface,
                          ),
                          child: Text(
                            '#$tag',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                      )
                      .toList(growable: false),
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(
                    Icons.subdirectory_arrow_right_rounded,
                    size: 18,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    tracker.trackingMode == HabitTrackerTrackingMode.eventLog
                        ? context.l10n.habitsModeEventLog
                        : context.l10n.habitsModeDailySummary,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ValueChip extends StatelessWidget {
  const _ValueChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Theme.of(context).colorScheme.surface,
      ),
      child: Text(
        '$label: $value',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _ActivityEmptyState extends StatelessWidget {
  const _ActivityEmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
          colors: [
            Theme.of(context).colorScheme.surfaceContainerLow,
            Theme.of(context).colorScheme.surface,
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant.withValues(
            alpha: 0.45,
          ),
        ),
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
            ),
            child: const Icon(Icons.history_rounded, size: 30),
          ),
          const SizedBox(height: 12),
          Text(
            context.l10n.habitsActivityEmptyTitle,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center),
        ],
      ),
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
