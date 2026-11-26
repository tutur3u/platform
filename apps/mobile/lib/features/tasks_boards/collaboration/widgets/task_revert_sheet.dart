import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/task_activity_cubit.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_snapshot.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/collab_common.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens web's snapshot and revert for one history entry. Resolves true
/// when a revert saved.
Future<bool?> showTaskRevertSheet(
  BuildContext context, {
  required TaskCollaborationRepository repository,
  required String wsId,
  required TaskBoardTask task,
  required String historyId,
}) => showAppSheet<bool>(
  context: context,
  size: AppSheetSize.large,
  builder: (_) => BlocProvider(
    create: (_) {
      final cubit = TaskRevertCubit(
        repository: repository,
        wsId: wsId,
        task: task,
        historyId: historyId,
      );
      unawaited(cubit.load());
      return cubit;
    },
    child: const TaskRevertSheet(),
  ),
);

/// The task as it was before the entry, with the fields that differ from
/// now selected for revert.
class TaskRevertSheet extends StatelessWidget {
  const TaskRevertSheet({super.key});

  Future<void> _revert(BuildContext context) async {
    final l10n = context.l10n;
    final failure = await context.read<TaskRevertCubit>().revert();
    if (!context.mounted) return;
    showCollabResult(
      context,
      failure,
      fallback: l10n.taskCollabRevertFailed,
      success: l10n.taskCollabRevertSuccess,
    );
    if (failure == null) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<TaskRevertCubit, TaskRevertState>(
      builder: (context, state) {
        final cubit = context.read<TaskRevertCubit>();
        final snapshot = state.snapshot;
        return AppSheetScaffold(
          title: l10n.taskCollabSnapshotTitle,
          actions: [
            if (state.load == CollabLoad.loaded && state.changed.isNotEmpty)
              AppButton.primary(
                key: const ValueKey('task-revert-submit'),
                loading: state.reverting,
                onPressed: state.selected.isEmpty || state.reverting
                    ? null
                    : () => unawaited(_revert(context)),
                child: Text(
                  state.reverting
                      ? l10n.taskCollabReverting
                      : l10n.taskCollabRevertSelected(state.selected.length),
                ),
              ),
          ],
          child: switch (state.load) {
            CollabLoad.loading => const CollabStatus.loading(),
            CollabLoad.failed => CollabStatus.failed(
              failure: state.loadFailure ?? CollabFailure.other,
              message: l10n.taskCollabSnapshotLoadFailed,
              onRetry: () => unawaited(cubit.load()),
            ),
            CollabLoad.loaded => switch (snapshot) {
              final snapshot? when state.changed.isNotEmpty => _ChangedFields(
                state: state,
                snapshot: snapshot,
              ),
              _ => CollabStatus.empty(l10n.taskCollabNoChanges),
            },
          },
        );
      },
    );
  }
}

class _ChangedFields extends StatelessWidget {
  const _ChangedFields({required this.state, required this.snapshot});

  final TaskRevertState state;
  final TaskSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final cubit = context.read<TaskRevertCubit>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.sm,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                l10n.taskCollabFieldsChanged(state.changed.length),
                style: tokens.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            AppButton.ghost(
              size: AppButtonSize.small,
              onPressed: state.reverting
                  ? null
                  : () => cubit.selectAll(
                      state.selected.length != state.changed.length,
                    ),
              child: Text(
                state.selected.length == state.changed.length
                    ? l10n.taskCollabDeselectAll
                    : l10n.taskCollabSelectAll,
              ),
            ),
          ],
        ),
        AppCard(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.xs,
          ),
          child: Column(
            children: [
              for (final field in state.changed)
                AppCheckboxRow(
                  key: ValueKey('task-revert-field-${field.wire}'),
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                  title: Text(l10n.taskCollabField(field.name)),
                  subtitle: Text(
                    snapshotValue(context, snapshot, field),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  value: state.selected.contains(field),
                  onChanged: state.reverting
                      ? null
                      : (_) => cubit.toggle(field),
                ),
            ],
          ),
        ),
        Text(
          l10n.taskCollabRevertWarning,
          style: tokens.typography.xSmall.copyWith(
            color: tokens.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}

/// The value [field] would return to.
String snapshotValue(
  BuildContext context,
  TaskSnapshot snapshot,
  TaskRevertField field,
) {
  final l10n = context.l10n;
  String names(List<TaskSnapshotEntity> entities) {
    final named = [
      for (final entity in entities)
        if (entity.name?.trim() case final name? when name.isNotEmpty) name,
    ];
    return named.isEmpty ? l10n.taskCollabNone : named.join(', ');
  }

  String date(DateTime? at) =>
      at == null ? l10n.taskCollabNone : collabTimestamp(context, at);
  return switch (field) {
    TaskRevertField.name => snapshot.name ?? l10n.taskCollabNone,
    TaskRevertField.description => l10n.taskCollabContentChanged,
    TaskRevertField.priority => switch (snapshot.priority) {
      'critical' => l10n.tasksPriorityUrgent,
      'high' => l10n.tasksPriorityHigh,
      'normal' => l10n.tasksPriorityMedium,
      'low' => l10n.tasksPriorityLow,
      _ => l10n.tasksPriorityNone,
    },
    TaskRevertField.startDate => date(snapshot.startDate),
    TaskRevertField.endDate => date(snapshot.endDate),
    TaskRevertField.estimationPoints =>
      snapshot.estimationPoints?.toString() ?? l10n.taskCollabNone,
    TaskRevertField.listId => snapshot.listName ?? l10n.taskCollabNone,
    TaskRevertField.completed =>
      snapshot.completed ? l10n.taskCollabCompleted : l10n.taskCollabIncomplete,
    TaskRevertField.assignees => names(snapshot.assignees),
    TaskRevertField.labels => names(snapshot.labels),
    TaskRevertField.projects => names(snapshot.projects),
  };
}
