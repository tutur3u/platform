part of 'task_board_detail_page.dart';

class _TaskQuickDetailSections extends StatefulWidget {
  const _TaskQuickDetailSections({
    required this.task,
    required this.board,
    required this.lists,
    required this.isPersonalWorkspace,
    required this.onNavigateRelatedTask,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final bool isPersonalWorkspace;
  final ValueChanged<RelatedTaskInfo> onNavigateRelatedTask;

  @override
  State<_TaskQuickDetailSections> createState() =>
      _TaskQuickDetailSectionsState();
}

class _TaskQuickDetailSectionsState extends State<_TaskQuickDetailSections> {
  bool _editing = false;
  bool _showRelationships = false;

  Widget _editor(_TaskBoardTaskDetailSection section) =>
      _TaskBoardTaskEditorSheet(
        key: ValueKey(section),
        task: widget.task,
        board: widget.board,
        defaultListId: widget.task.listId,
        lists: widget.lists,
        labels: widget.board.labels,
        members: widget.board.members,
        projects: widget.board.projects,
        isPersonalWorkspace: widget.isPersonalWorkspace,
        embedded: true,
        embeddedSection: section,
        embeddedMinHeight: section == _TaskBoardTaskDetailSection.description
            ? 300
            : null,
        onNavigateRelatedTask: widget.onNavigateRelatedTask,
      );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final muted = AppTokens.of(context).colorScheme.mutedForeground;
    final typography = AppTokens.of(context).typography;
    final description = _editing
        ? null
        : _taskDescriptionParsed(widget.task.description);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.sm,
      children: [
        Row(
          children: [
            Expanded(
              child: _TaskQuickSectionCaption(
                l10n.taskBoardDetailTaskDescriptionLabel,
              ),
            ),
            AppIconButton(
              key: const ValueKey('kanban-detail-edit-description'),
              tooltip: _editing
                  ? l10n.commonDone
                  : l10n.taskBoardDetailTaskEditDescription,
              icon: Icon(
                _editing ? LucideIcons.check : LucideIcons.pencil,
                size: 18,
              ),
              onPressed: () => setState(() => _editing = !_editing),
            ),
          ],
        ),
        if (_editing)
          _editor(_TaskBoardTaskDetailSection.description)
        else if (description == null)
          Text(
            l10n.taskBoardDetailTaskNoDescription,
            style: typography.small.copyWith(color: muted),
          )
        else
          _TaskBoardDescriptionDocument(description: description),
        const SizedBox(height: AppSpacing.sm),
        AppGroupedCard(
          children: [
            Semantics(
              expanded: _showRelationships,
              child: AppGroupedRow(
                key: const ValueKey('kanban-detail-relationships'),
                leading: const AppIconTile(icon: LucideIcons.gitBranch),
                title: Text(l10n.taskBoardDetailEditorRelationshipsTab),
                trailing: Icon(
                  _showRelationships
                      ? LucideIcons.chevronUp
                      : LucideIcons.chevronDown,
                  size: 18,
                  color: muted,
                ),
                onTap: () =>
                    setState(() => _showRelationships = !_showRelationships),
              ),
            ),
          ],
        ),
        if (_showRelationships)
          _editor(_TaskBoardTaskDetailSection.relationships),
      ],
    );
  }
}
