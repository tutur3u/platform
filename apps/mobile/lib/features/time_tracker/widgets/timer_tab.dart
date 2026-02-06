import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/category_picker.dart';
import 'package:mobile/features/time_tracker/widgets/missed_entry_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/session_tile.dart';
import 'package:mobile/features/time_tracker/widgets/stats_cards.dart';
import 'package:mobile/features/time_tracker/widgets/timer_controls.dart';
import 'package:mobile/features/time_tracker/widgets/timer_display.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class TimerTab extends StatelessWidget {
  const TimerTab({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
      builder: (context, state) {
        final l10n = context.l10n;
        final cubit = context.read<TimeTrackerCubit>();
        final wsId =
            context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
        final userId = supabase.auth.currentUser?.id ?? '';

        return ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            const SizedBox(height: 32),
            // Timer display
            Center(
              child: TimerDisplay(
                elapsed: state.elapsed,
                isRunning: state.isRunning,
                isPaused: state.isPaused,
                pomodoroPhase: state.pomodoroPhase,
              ),
            ),
            const SizedBox(height: 24),
            // Timer controls
            TimerControls(
              isRunning: state.isRunning,
              isPaused: state.isPaused,
              onStart: () => unawaited(cubit.startSession(wsId)),
              onStop: () => unawaited(cubit.stopSession(wsId, userId)),
              onPause: () => unawaited(cubit.pauseSession()),
              onResume: () => unawaited(cubit.resumeSession()),
              onAddMissedEntry: () => _showMissedEntryDialog(context),
            ),
            const SizedBox(height: 24),
            // Session title input
            if (!state.isRunning && !state.isPaused)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  decoration: InputDecoration(
                    labelText: l10n.timerSessionTitle,
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                  onChanged: cubit.setTitle,
                ),
              ),
            const SizedBox(height: 16),
            // Category picker
            CategoryPicker(
              categories: state.categories,
              selectedCategoryId: state.selectedCategoryId,
              onSelected: cubit.selectCategory,
              onAddCategory: () => _showAddCategoryDialog(context, wsId),
            ),
            const SizedBox(height: 24),
            // Quick stats
            StatsCards(stats: state.stats),
            const SizedBox(height: 24),
            // Recent sessions
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    l10n.timerRecentSessions,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (state.recentSessions.isNotEmpty)
                    TextButton(
                      onPressed: () =>
                          DefaultTabController.of(context).animateTo(1),
                      child: Text(l10n.timerSeeAll),
                    ),
                ],
              ),
            ),
            if (state.recentSessions.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  l10n.timerNoSessions,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              )
            else
              ...state.recentSessions.map(
                (session) => SessionTile(
                  session: session,
                  onDelete: () => unawaited(
                    cubit.deleteSession(session.id, wsId, userId),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  void _showMissedEntryDialog(BuildContext context) {
    final cubit = context.read<TimeTrackerCubit>();
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    final userId = supabase.auth.currentUser?.id ?? '';

    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => MissedEntryDialog(
          categories: cubit.state.categories,
          onSave:
              ({
                required title,
                required startTime,
                required endTime,
                categoryId,
                description,
              }) {
                unawaited(
                  cubit.createMissedEntry(
                    wsId,
                    userId,
                    title: title,
                    categoryId: categoryId,
                    startTime: startTime,
                    endTime: endTime,
                    description: description,
                  ),
                );
              },
        ),
      ),
    );
  }

  void _showAddCategoryDialog(BuildContext context, String wsId) {
    final cubit = context.read<TimeTrackerCubit>();
    final controller = TextEditingController();

    unawaited(
      showDialog<void>(
        context: context,
        builder: (dialogCtx) => AlertDialog(
          title: Text(context.l10n.timerAddCategory),
          content: TextField(
            controller: controller,
            autofocus: true,
            decoration: InputDecoration(
              labelText: context.l10n.timerCategoryName,
              border: const OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogCtx).pop(),
              child: Text(
                MaterialLocalizations.of(dialogCtx).cancelButtonLabel,
              ),
            ),
            FilledButton(
              onPressed: () {
                if (controller.text.isNotEmpty) {
                  unawaited(cubit.createCategory(wsId, controller.text));
                  Navigator.of(dialogCtx).pop();
                }
              },
              child: Text(context.l10n.timerSave),
            ),
          ],
        ),
      ),
    );
  }
}
