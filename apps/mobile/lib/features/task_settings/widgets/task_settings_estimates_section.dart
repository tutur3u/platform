import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart' show showAppDialog;
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/utils/estimation_type_meta.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimate_dialog.dart';
import 'package:mobile/l10n/l10n.dart';

/// One row per board with its estimation method. Rows open the estimate
/// editor only when [canManage] is true; otherwise they are read-only.
class TaskSettingsEstimatesSection extends StatelessWidget {
  const TaskSettingsEstimatesSection({
    required this.state,
    required this.canManage,
    super.key,
  });

  final TaskEstimatesState state;
  final bool canManage;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final boards = state.boards;
    final List<Widget> children;
    if (boards.isEmpty && state.status == TaskEstimatesStatus.error) {
      children = [
        AppStateMessage.inline(
          icon: Icons.error_outline_rounded,
          title: l10n.taskBoardsLoadError,
          tone: AppTone.destructive,
        ),
      ];
    } else if (boards.isEmpty &&
        (state.status == TaskEstimatesStatus.loading ||
            state.status == TaskEstimatesStatus.initial)) {
      children = const [AppSkeletonRows()];
    } else if (boards.isEmpty) {
      children = [
        AppStateMessage.inline(
          icon: LucideIcons.squareKanban,
          title: l10n.taskEstimatesNoBoardsTitle,
          message: l10n.taskEstimatesNoBoardsDescription,
        ),
      ];
    } else {
      final enabled = canManage && state.status != TaskEstimatesStatus.updating;
      children = [
        for (final board in boards)
          TaskSettingsEstimateRow(
            key: ValueKey('task-settings-estimate-${board.id}'),
            board: board,
            readOnly: !canManage,
            onTap: enabled ? () => _openEditor(context, board) : null,
          ),
      ];
    }
    return AppGroupedSection(
      caption: l10n.taskEstimatesTitle,
      children: children,
    );
  }

  void _openEditor(BuildContext context, TaskEstimateBoard board) {
    final cubit = context.read<TaskEstimatesCubit>();
    unawaited(
      showAppDialog<void>(
        useRootNavigator: true,
        context: context,
        builder: (_) => BlocProvider.value(
          value: cubit,
          child: TaskEstimateDialog(board: board),
        ),
      ),
    );
  }
}

class TaskSettingsEstimateRow extends StatelessWidget {
  const TaskSettingsEstimateRow({
    required this.board,
    required this.readOnly,
    this.onTap,
    super.key,
  });

  final TaskEstimateBoard board;
  final bool readOnly;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final method = board.estimationType;
    final methodLabel = method == null
        ? l10n.taskSettingsEstimateNotSet
        : estimationTypeMeta(context, method).label;
    return AppGroupedRow(
      leading: const AppIconTile(icon: LucideIcons.squareKanban),
      title: Text(board.name ?? l10n.taskEstimatesUnnamedBoard),
      trailing: Text(
        methodLabel,
        style: method == null ? TextStyle(color: colors.destructive) : null,
      ),
      showChevron: !readOnly,
      onTap: onTap,
    );
  }
}
