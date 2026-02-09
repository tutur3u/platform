import 'dart:async';

import 'package:flutter/material.dart'
    hide TextField, TextButton, FilledButton, AlertDialog;
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
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TimerTab extends StatelessWidget {
  const TimerTab({this.onSeeAll, super.key});

  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
      builder: (context, state) {
        final l10n = context.l10n;
        final theme = shad.Theme.of(context);
        final cubit = context.read<TimeTrackerCubit>();
        final wsId =
            context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
        final userId = supabase.auth.currentUser?.id ?? '';

        return ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            const shad.Gap(32),
            // Timer display
            Center(
              child: TimerDisplay(
                elapsed: state.elapsed,
                isRunning: state.isRunning,
                isPaused: state.isPaused,
                pomodoroPhase: state.pomodoroPhase,
              ),
            ),
            const shad.Gap(24),
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
            const shad.Gap(24),
            // Session title input
            if (!state.isRunning && !state.isPaused)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: shad.FormField(
                  key: const shad.FormKey<String>(#sessionTitle),
                  label: Text(l10n.timerSessionTitle),
                  child: shad.TextField(
                    onChanged: cubit.setTitle,
                  ),
                ),
              ),
            const shad.Gap(16),
            // Category picker
            CategoryPicker(
              categories: state.categories,
              selectedCategoryId: state.selectedCategoryId,
              onSelected: cubit.selectCategory,
              onAddCategory: () => _showAddCategoryDialog(context, wsId),
            ),
            const shad.Gap(24),
            // Quick stats
            StatsCards(stats: state.stats),
            const shad.Gap(24),
            // Recent sessions
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    l10n.timerRecentSessions,
                    style: theme.typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (state.recentSessions.isNotEmpty)
                    shad.GhostButton(
                      onPressed: onSeeAll,
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
                  style: theme.typography.textMuted,
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
      shad.openDrawer<void>(
        context: context,
        position: shad.OverlayPosition.bottom,
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
        builder: (dialogCtx) => Center(
          child: SizedBox(
            width: MediaQuery.of(context).size.width * 0.8,
            child: shad.AlertDialog(
              title: Text(context.l10n.timerAddCategory),
              content: shad.FormField(
                key: const shad.FormKey<String>(#newCategory),
                label: Text(context.l10n.timerCategoryName),
                child: shad.TextField(
                  controller: controller,
                  autofocus: true,
                ),
              ),
              actions: [
                shad.OutlineButton(
                  onPressed: () => Navigator.of(dialogCtx).pop(),
                  child: const Text('Cancel'),
                ),
                shad.PrimaryButton(
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
        ),
      ),
    );
  }
}

