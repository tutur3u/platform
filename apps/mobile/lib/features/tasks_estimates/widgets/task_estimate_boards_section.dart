import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
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

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: boards.isEmpty
          ? TaskEstimatesEmptyState(
              title: l10n.taskEstimatesNoBoardsTitle,
              description: l10n.taskEstimatesNoBoardsDescription,
            )
          : Column(
              children: [
                for (var index = 0; index < boards.length; index++) ...[
                  _TaskEstimateBoardTile(
                    board: boards[index],
                    enabled: !isUpdating,
                  ),
                  if (index < boards.length - 1) const shad.Gap(8),
                ],
              ],
            ),
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
    final locale = Localizations.localeOf(context).toString();

    return shad.Card(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
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
          padding: const EdgeInsets.all(14),
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
                          board.name,
                          style: theme.typography.p.copyWith(
                            fontWeight: FontWeight.w600,
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
                  const Icon(Icons.chevron_right),
                ],
              ),
              const shad.Gap(8),
              Text(
                type.description(isExtended: board.extendedEstimation),
                style: theme.typography.textMuted,
              ),
              if (board.createdAt != null) ...[
                const shad.Gap(8),
                Text(
                  DateFormat.yMd(locale).format(board.createdAt!),
                  style: theme.typography.textSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
