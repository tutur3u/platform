part of 'task_board_detail_page.dart';

extension _TaskBoardEditorRelationships on _TaskBoardTaskEditorSheetState {
  Widget _buildRelationshipsTab(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final relationships = _relationships;
    final navigate = widget.embedded ? _navigateToRelatedTask : null;
    VoidCallback? add(Future<void> Function() pick) =>
        _isBusy ? null : () => unawaited(pick());
    void Function(RelatedTaskInfo task)? remove(
      Future<void> Function(RelatedTaskInfo task) action,
    ) => _isBusy ? null : (task) => unawaited(action(task));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppLayout.itemGap,
      children: [
        if (_isLoadingRelationships)
          const Align(
            alignment: AlignmentDirectional.centerStart,
            child: AppLoadingIndicator.inline(),
          ),
        if (_relationshipsError case final error?)
          Text(
            error,
            style: AppTokens.of(
              context,
            ).typography.small.copyWith(color: c.destructive),
          ),
        if (!_isLoadingRelationships &&
            _relationshipsError == null &&
            relationships.totalCount == 0)
          const _TaskDetailRelationshipsEmpty(),
        _TaskRelationshipGroup(
          kind: _TaskRelationshipKind.parent,
          title: l10n.taskBoardDetailParentTask,
          tasks: [?relationships.parentTask],
          addLabel: l10n.taskBoardDetailAddParentTask,
          onAdd: add(_pickParentTask),
          onRemove: remove(_removeParentRelationship),
          onNavigate: navigate,
        ),
        _TaskRelationshipGroup(
          kind: _TaskRelationshipKind.child,
          title: widget.onNavigateRelatedTask == null
              ? l10n.taskBoardDetailChildTasks
              : l10n.tasksSubtasks,
          tasks: relationships.childTasks,
          addLabel: l10n.taskBoardDetailAddChildTask,
          onAdd: add(_pickChildTask),
          onRemove: remove(_removeChildRelationship),
          onNavigate: navigate,
        ),
        _TaskRelationshipGroup(
          kind: _TaskRelationshipKind.blockedBy,
          title: l10n.taskBoardDetailBlockedBy,
          tasks: relationships.blockedBy,
          addLabel: l10n.taskBoardDetailAddBlockedByTask,
          onAdd: add(_pickBlockedByTask),
          onRemove: remove(_removeBlockedByRelationship),
          onNavigate: navigate,
        ),
        _TaskRelationshipGroup(
          kind: _TaskRelationshipKind.blocking,
          title: l10n.taskBoardDetailBlocking,
          tasks: relationships.blocking,
          addLabel: l10n.taskBoardDetailAddBlockingTask,
          onAdd: add(_pickBlockingTask),
          onRemove: remove(_removeBlockingRelationship),
          onNavigate: navigate,
        ),
        _TaskRelationshipGroup(
          kind: _TaskRelationshipKind.related,
          title: l10n.taskBoardDetailRelatedTasks,
          tasks: relationships.relatedTasks,
          addLabel: l10n.taskBoardDetailAddRelatedTask,
          onAdd: add(_pickRelatedTask),
          onRemove: remove(_removeRelatedRelationship),
          onNavigate: navigate,
        ),
      ],
    );
  }
}
