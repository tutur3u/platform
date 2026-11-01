part of 'habit_tracker_detail_sheet.dart';

class _EntriesTab extends StatelessWidget {
  const _EntriesTab({
    required this.detail,
    required this.isSubmittingEntry,
    required this.onDeleteEntry,
    required this.onRefresh,
  });

  final Future<void> Function() onRefresh;
  final HabitTrackerDetailResponse detail;
  final bool isSubmittingEntry;
  final Future<void> Function(String entryId) onDeleteEntry;

  @override
  Widget build(BuildContext context) {
    if (detail.entries.isEmpty) {
      return NovaRefreshIndicator.state(
        onRefresh: onRefresh,
        child: Center(child: Text(context.l10n.habitsNoEntries)),
      );
    }
    return NovaRefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemBuilder: (context, index) {
          final entry = detail.entries[index];
          final exerciseBlocks = entry.values['exercise_blocks'];
          return FinancePanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        entry.member?.label ?? entry.entryDate,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(entry.entryDate),
                    const SizedBox(width: 8),
                    IconButton(
                      onPressed: isSubmittingEntry
                          ? null
                          : () => onDeleteEntry(entry.id),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                for (final field in detail.tracker.inputSchema)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      '${field.label}: '
                      '${formatFieldValue(field, entry.values[field.key])}',
                    ),
                  ),
                if (exerciseBlocks is List<HabitTrackerExerciseBlock> &&
                    exerciseBlocks.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  ...exerciseBlocks.map(
                    (block) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Builder(
                        builder: (context) {
                          final weightLabel = block.weight == null
                              ? ''
                              : ' • ${formatCompactNumber(block.weight!)} '
                                    '${block.unit ?? ''}';

                          return Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(16),
                              color: Theme.of(
                                context,
                              ).colorScheme.surface.withValues(alpha: 0.82),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  block.exerciseName,
                                  style: Theme.of(context).textTheme.titleSmall
                                      ?.copyWith(fontWeight: FontWeight.w700),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${block.sets} x ${block.reps}$weightLabel',
                                ),
                                if (block.notes?.trim().isNotEmpty == true) ...[
                                  const SizedBox(height: 4),
                                  Text(block.notes!.trim()),
                                ],
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ],
                if (entry.note?.trim().isNotEmpty == true) ...[
                  const SizedBox(height: 8),
                  Text(entry.note!.trim()),
                ],
              ],
            ),
          );
        },
        separatorBuilder: (context, index) => const SizedBox(height: 10),
        itemCount: detail.entries.length,
      ),
    );
  }
}

class _LeaderboardTab extends StatelessWidget {
  const _LeaderboardTab({required this.detail, required this.onRefresh});

  final Future<void> Function() onRefresh;
  final HabitTrackerDetailResponse detail;

  @override
  Widget build(BuildContext context) {
    if (detail.leaderboard.isEmpty) {
      return NovaRefreshIndicator.state(
        onRefresh: onRefresh,
        child: Center(child: Text(context.l10n.habitsNoLeaderboard)),
      );
    }
    return NovaRefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemBuilder: (context, index) {
          final row = detail.leaderboard[index];
          return Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              color: Theme.of(context).colorScheme.surfaceContainerLow,
            ),
            child: Row(
              children: [
                CircleAvatar(child: Text('${index + 1}')),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        row.member.label,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${context.l10n.habitsCurrentStreak}: '
                        '${row.currentStreak} • '
                        '${context.l10n.habitsBestStreak}: ${row.bestStreak}',
                      ),
                    ],
                  ),
                ),
                Text(formatCompactNumber(row.currentPeriodTotal)),
              ],
            ),
          );
        },
        separatorBuilder: (context, index) => const SizedBox(height: 10),
        itemCount: detail.leaderboard.length,
      ),
    );
  }
}
