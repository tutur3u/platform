import 'package:flutter/material.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/view/habits_page_chrome.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_card.dart';

class HabitsOverviewSection extends StatelessWidget {
  const HabitsOverviewSection({
    required this.filteredTrackers,
    required this.state,
    required this.onCreateTracker,
    required this.onEditTracker,
    required this.onOpenTracker,
    required this.onQuickLog,
    super.key,
  });

  final List<HabitTrackerCardSummary> filteredTrackers;
  final HabitsState state;
  final Future<void> Function() onCreateTracker;
  final Future<void> Function(HabitTracker tracker) onEditTracker;
  final Future<void> Function(String trackerId) onOpenTracker;
  final Future<void> Function(HabitTrackerCardSummary tracker) onQuickLog;

  @override
  Widget build(BuildContext context) {
    if (filteredTrackers.isEmpty) {
      return HabitsEmptyView(onCreateTracker: onCreateTracker);
    }

    return Column(
      children: filteredTrackers
          .map(
            (tracker) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: HabitTrackerCard(
                summary: tracker,
                scope: state.selectedScope,
                selected: tracker.tracker.id == state.selectedTrackerId,
                onQuickLog: () => onQuickLog(tracker),
                onSelect: () => onOpenTracker(tracker.tracker.id),
                onEdit: () => onEditTracker(tracker.tracker),
              ),
            ),
          )
          .toList(growable: false),
    );
  }
}
