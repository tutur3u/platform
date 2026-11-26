import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/task_activity_cubit.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/collab_common.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_revert_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// What happened to the task, newest first: history, comments and links
/// in one timeline, as web shows it. Task changes offer web's snapshot and
/// revert; the server decides whether the viewer may revert.
class TaskActivitySection extends StatefulWidget {
  const TaskActivitySection({
    required this.wsId,
    required this.task,
    this.enabled = true,
    this.onReverted,
    super.key,
  });

  final String wsId;

  /// The task as it is now, which a snapshot is compared with.
  final TaskBoardTask task;
  final bool enabled;

  /// Runs after a revert saves, to reload the task elsewhere on screen.
  final VoidCallback? onReverted;

  @override
  State<TaskActivitySection> createState() => _TaskActivitySectionState();
}

class _TaskActivitySectionState extends State<TaskActivitySection> {
  late final TaskCollaborationRepository _repository =
      context.read<TaskCollaborationRepository?>() ??
      TaskCollaborationRepository();
  late final TaskActivityCubit _cubit = TaskActivityCubit(
    repository: _repository,
    wsId: widget.wsId,
    taskId: widget.task.id,
  );

  @override
  void initState() {
    super.initState();
    unawaited(_cubit.load());
  }

  @override
  void dispose() {
    unawaited(_cubit.close());
    super.dispose();
  }

  Future<void> _loadMore() async {
    final failure = await _cubit.loadMore();
    if (!mounted) return;
    showCollabResult(
      context,
      failure,
      fallback: context.l10n.taskCollabActivityLoadFailed,
    );
  }

  Future<void> _openRevert(TaskTimelineEvent event) async {
    final reverted = await showTaskRevertSheet(
      context,
      repository: _repository,
      wsId: widget.wsId,
      task: widget.task,
      historyId: event.id,
    );
    if (reverted != true || !mounted) return;
    widget.onReverted?.call();
    unawaited(_cubit.load());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocProvider.value(
      value: _cubit,
      child: BlocBuilder<TaskActivityCubit, TaskActivityState>(
        builder: (context, state) => CollabSection(
          title: l10n.taskCollabActivity,
          child: switch (state.load) {
            CollabLoad.loading => const CollabStatus.loading(),
            CollabLoad.failed => CollabStatus.failed(
              failure: state.loadFailure ?? CollabFailure.other,
              message: l10n.taskCollabActivityLoadFailed,
              onRetry: () => unawaited(_cubit.load()),
            ),
            CollabLoad.loaded when state.events.isEmpty => CollabStatus.empty(
              l10n.taskCollabNoActivity,
            ),
            CollabLoad.loaded => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: AppSpacing.sm,
              children: [
                AppCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                  ),
                  child: Column(
                    children: [
                      for (final (index, event) in state.events.indexed)
                        _ActivityTile(
                          key: ValueKey('task-activity-${event.id}'),
                          event: event,
                          divided: index > 0,
                          onRevert: event.restorable && widget.enabled
                              ? () => unawaited(_openRevert(event))
                              : null,
                        ),
                    ],
                  ),
                ),
                if (state.hasMore)
                  AppButton.ghost(
                    key: const ValueKey('task-activity-more'),
                    loading: state.loadingMore,
                    onPressed: state.loadingMore
                        ? null
                        : () => unawaited(_loadMore()),
                    child: Text(l10n.commonLoadMore),
                  ),
              ],
            ),
          },
        ),
      ),
    );
  }
}

/// One timeline entry: who did what and when, and its detail.
class _ActivityTile extends StatelessWidget {
  const _ActivityTile({
    required this.event,
    required this.divided,
    required this.onRevert,
    super.key,
  });

  final TaskTimelineEvent event;
  final bool divided;
  final VoidCallback? onRevert;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final name = collabPersonName(
      context,
      event.actor,
      external: event.externalActor,
    );
    final detail = activityDetail(event);
    return DecoratedBox(
      decoration: BoxDecoration(
        border: divided
            ? Border(top: BorderSide(color: tokens.colorScheme.border))
            : null,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: AppSpacing.sm,
          children: [
            CollabAvatar(name: name, avatarUrl: event.actor?.avatarUrl),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: AppSpacing.xxs,
                children: [
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: name,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        TextSpan(text: ' ${activityVerb(context, event)}'),
                      ],
                    ),
                    style: tokens.typography.small,
                  ),
                  if (detail != null)
                    Text(
                      detail,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.small.copyWith(
                        color: tokens.colorScheme.mutedForeground,
                      ),
                    ),
                  if (event.at case final at?)
                    Text(
                      collabTimestamp(context, at),
                      style: tokens.typography.xSmall.copyWith(
                        color: tokens.colorScheme.mutedForeground,
                      ),
                    ),
                  if (onRevert case final revert?)
                    AppButton.ghost(
                      key: ValueKey('task-activity-revert-${event.id}'),
                      size: AppButtonSize.small,
                      onPressed: revert,
                      leading: const Icon(LucideIcons.history, size: 14),
                      child: Text(l10n.taskCollabViewSnapshot),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The phrase after the actor's name, in web's wording.
String activityVerb(BuildContext context, TaskTimelineEvent event) {
  final l10n = context.l10n;
  if (event.type == 'field_updated') {
    return l10n.taskCollabFieldUpdated(event.fieldName ?? 'other');
  }
  return l10n.taskCollabEvent(event.type);
}

/// The entry's subject when it has one: a comment's text or a link.
String? activityDetail(TaskTimelineEvent event) {
  final comment = event.comment?.body.trim();
  if (comment != null && comment.isNotEmpty) return comment;
  if (event.type == 'link_added' || event.type == 'link_removed') {
    final title = event.metadata['title'];
    final url = event.metadata['url'];
    if (title is String && title.trim().isNotEmpty) return title.trim();
    if (url is String && url.trim().isNotEmpty) return url.trim();
  }
  return null;
}
