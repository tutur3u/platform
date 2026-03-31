import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/features/tasks/widgets/task_surface.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/utils/estimation_type_meta.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimate_dialog.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimates_feedback.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskEstimateBoardsSection extends StatelessWidget {
  const TaskEstimateBoardsSection({
    required this.boards,
    required this.isUpdating,
    super.key,
  });

  final List<TaskEstimateBoard> boards;
  final bool isUpdating;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return boards.isEmpty
        ? TaskEstimatesEmptyState(
            title: l10n.taskEstimatesNoBoardsTitle,
            description: l10n.taskEstimatesNoBoardsDescription,
          )
        : Column(
            children: [
              for (var index = 0; index < boards.length; index++) ...[
                if (index > 0) const shad.Gap(10),
                _TaskEstimateBoardTile(
                  board: boards[index],
                  enabled: !isUpdating,
                ),
              ],
            ],
          );
  }
}

class _TaskEstimateBoardTile extends StatelessWidget {
  const _TaskEstimateBoardTile({
    required this.board,
    required this.enabled,
  });

  final TaskEstimateBoard board;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final type = estimationTypeMeta(context, board.estimationType);
    final boardName = board.name ?? l10n.taskEstimatesUnnamedBoard;

    return TaskSurfacePane(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: enabled
            ? () {
                final cubit = context.read<TaskEstimatesCubit>();
                unawaited(
                  shad.showDialog<void>(
                    context: context,
                    builder: (_) => BlocProvider.value(
                      value: cubit,
                      child: TaskEstimateDialog(board: board),
                    ),
                  ),
                );
              }
            : null,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          boardName,
                          style: theme.typography.p.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const shad.Gap(8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            shad.OutlineBadge(child: Text(type.label)),
                            if (board.estimationType != null &&
                                board.extendedEstimation)
                              shad.OutlineBadge(
                                child: Text(l10n.taskEstimatesExtendedBadge),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const shad.Gap(8),
                  Icon(
                    Icons.arrow_forward_rounded,
                    color: theme.colorScheme.primary,
                  ),
                ],
              ),
              const shad.Gap(10),
              Text(
                type.description(
                  isExtended: board.extendedEstimation,
                  allowZeroEstimates: board.allowZeroEstimates,
                ),
                style: theme.typography.textMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
