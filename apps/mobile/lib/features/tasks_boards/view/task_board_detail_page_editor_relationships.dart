part of 'task_board_detail_page.dart';

extension _TaskBoardEditorRelationships on _TaskBoardTaskEditorSheetState {
  Widget _buildRelationshipsTab(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_isLoadingRelationships) const NovaLoadingIndicator(size: 20),
        if (_relationshipsError != null) ...[
          const shad.Gap(8),
          Text(
            _relationshipsError!,
            style: shad.Theme.of(context).typography.small.copyWith(
              color: shad.Theme.of(context).colorScheme.destructive,
            ),
          ),
        ],
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailParentTask,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.parent),
          children: [
            if (_relationships.parentTask != null)
              _RelationshipTaskTile(
                task: _relationships.parentTask!,
                onNavigate: widget.embedded
                    ? () => _navigateToRelatedTask(_relationships.parentTask!)
                    : null,
                onRemove: _isBusy
                    ? null
                    : () =>
                          _removeParentRelationship(_relationships.parentTask!),
              )
            else
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddParentTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickParentTask,
            ),
          ],
        ),
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: widget.onNavigateRelatedTask == null
              ? context.l10n.taskBoardDetailChildTasks
              : context.l10n.tasksSubtasks,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.child),
          children: [
            if (_relationships.childTasks.isEmpty)
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            ..._relationships.childTasks.map(
              (task) => Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _RelationshipTaskTile(
                  task: task,
                  onNavigate: widget.embedded
                      ? () => _navigateToRelatedTask(task)
                      : null,
                  onRemove: _isBusy
                      ? null
                      : () => _removeChildRelationship(task),
                ),
              ),
            ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddChildTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickChildTask,
            ),
          ],
        ),
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailBlockedBy,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.blockedBy),
          children: [
            if (_relationships.blockedBy.isEmpty)
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            ..._relationships.blockedBy.map(
              (task) => Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _RelationshipTaskTile(
                  task: task,
                  onNavigate: widget.embedded
                      ? () => _navigateToRelatedTask(task)
                      : null,
                  onRemove: _isBusy
                      ? null
                      : () => _removeBlockedByRelationship(task),
                ),
              ),
            ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddBlockedByTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickBlockedByTask,
            ),
          ],
        ),
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailBlocking,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.blocking),
          children: [
            if (_relationships.blocking.isEmpty)
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            ..._relationships.blocking.map(
              (task) => Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _RelationshipTaskTile(
                  task: task,
                  onNavigate: widget.embedded
                      ? () => _navigateToRelatedTask(task)
                      : null,
                  onRemove: _isBusy
                      ? null
                      : () => _removeBlockingRelationship(task),
                ),
              ),
            ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddBlockingTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickBlockingTask,
            ),
          ],
        ),
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailRelatedTasks,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.related),
          children: [
            if (_relationships.relatedTasks.isEmpty)
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            ..._relationships.relatedTasks.map(
              (task) => Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _RelationshipTaskTile(
                  task: task,
                  onNavigate: widget.embedded
                      ? () => _navigateToRelatedTask(task)
                      : null,
                  onRemove: _isBusy
                      ? null
                      : () => _removeRelatedRelationship(task),
                ),
              ),
            ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddRelatedTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickRelatedTask,
            ),
          ],
        ),
      ],
    );
  }
}
