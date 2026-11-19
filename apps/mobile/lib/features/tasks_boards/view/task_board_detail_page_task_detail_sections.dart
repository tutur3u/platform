part of 'task_board_detail_page.dart';

/// The embedded task editor for one detail [section]. The description
/// editor autosaves as the user types; the relationships editor saves each
/// link as it is made.
Widget _taskDetailEmbeddedEditor({
  required TaskBoardTask task,
  required TaskBoardDetail board,
  required List<TaskBoardList> lists,
  required bool isPersonalWorkspace,
  required _TaskBoardTaskDetailSection section,
  required ValueChanged<RelatedTaskInfo> onNavigateRelatedTask,
  double? minHeight,
}) => _TaskBoardTaskEditorSheet(
  key: ValueKey('task-detail-editor-${task.id}-${section.name}'),
  task: task,
  board: board,
  defaultListId: task.listId,
  lists: lists,
  labels: board.labels,
  members: board.members,
  projects: board.projects,
  isPersonalWorkspace: isPersonalWorkspace,
  embedded: true,
  embeddedSection: section,
  embeddedMinHeight: minHeight,
  onNavigateRelatedTask: onNavigateRelatedTask,
);

/// The rendered description with an Edit toggle that swaps in the rich
/// editor.
class _TaskDetailDescriptionSection extends StatefulWidget {
  const _TaskDetailDescriptionSection({
    required this.task,
    required this.board,
    required this.lists,
    required this.isPersonalWorkspace,
    required this.editorHeight,
    required this.onNavigateRelatedTask,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final bool isPersonalWorkspace;
  final double editorHeight;
  final ValueChanged<RelatedTaskInfo> onNavigateRelatedTask;

  @override
  State<_TaskDetailDescriptionSection> createState() =>
      _TaskDetailDescriptionSectionState();
}

class _TaskDetailDescriptionSectionState
    extends State<_TaskDetailDescriptionSection> {
  bool _editing = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final description = _editing
        ? null
        : _taskDescriptionParsed(widget.task.description);
    final Widget body;
    if (_editing) {
      body = _taskDetailEmbeddedEditor(
        task: widget.task,
        board: widget.board,
        lists: widget.lists,
        isPersonalWorkspace: widget.isPersonalWorkspace,
        section: _TaskBoardTaskDetailSection.description,
        onNavigateRelatedTask: widget.onNavigateRelatedTask,
        minHeight: widget.editorHeight,
      );
    } else if (description == null) {
      body = AppGroupedCard(
        children: [
          AppGroupedRow(
            key: const ValueKey('task-detail-add-description'),
            leading: const AppIconTile(icon: LucideIcons.text),
            title: Text(
              l10n.taskBoardDetailTaskNoDescription,
              style: TextStyle(color: c.mutedForeground),
            ),
            showChevron: true,
            onTap: () => setState(() => _editing = true),
          ),
        ],
      );
    } else {
      body = AppCard(
        child: _TaskBoardDescriptionDocument(description: description),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: _TaskQuickSectionCaption(
                l10n.taskBoardDetailTaskDescriptionLabel,
              ),
            ),
            // An empty description opens from its own row instead.
            if (_editing || description != null)
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
        body,
      ],
    );
  }
}

/// Parent, subtasks, blockers and related tasks. On the sheet the section
/// opens on demand, so the sheet loads relationships only when asked; the
/// detail screen always shows it.
class _TaskDetailRelationshipsSection extends StatefulWidget {
  const _TaskDetailRelationshipsSection({
    required this.task,
    required this.board,
    required this.lists,
    required this.isPersonalWorkspace,
    required this.collapsible,
    required this.onNavigateRelatedTask,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final bool isPersonalWorkspace;
  final bool collapsible;
  final ValueChanged<RelatedTaskInfo> onNavigateRelatedTask;

  @override
  State<_TaskDetailRelationshipsSection> createState() =>
      _TaskDetailRelationshipsSectionState();
}

class _TaskDetailRelationshipsSectionState
    extends State<_TaskDetailRelationshipsSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final muted = AppTokens.of(context).colorScheme.mutedForeground;
    final expanded = !widget.collapsible || _expanded;
    final editor = expanded
        ? _taskDetailEmbeddedEditor(
            task: widget.task,
            board: widget.board,
            lists: widget.lists,
            isPersonalWorkspace: widget.isPersonalWorkspace,
            section: _TaskBoardTaskDetailSection.relationships,
            onNavigateRelatedTask: widget.onNavigateRelatedTask,
          )
        : const SizedBox(width: double.infinity);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.sm,
      children: [
        if (widget.collapsible)
          AppGroupedCard(
            children: [
              Semantics(
                expanded: _expanded,
                child: AppGroupedRow(
                  key: const ValueKey('kanban-detail-relationships'),
                  leading: const AppIconTile(icon: LucideIcons.gitBranch),
                  title: Text(l10n.taskBoardDetailEditorRelationshipsTab),
                  trailing: Icon(
                    _expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                    size: 18,
                    color: muted,
                  ),
                  onTap: () => setState(() => _expanded = !_expanded),
                ),
              ),
            ],
          )
        else
          _TaskQuickSectionCaption(l10n.taskBoardDetailEditorRelationshipsTab),
        // The section grows into place; under reduced motion it appears
        // at once.
        if (MediaQuery.disableAnimationsOf(context))
          editor
        else
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: editor,
          ),
      ],
    );
  }
}

/// The empty relationships state: the linked-tasks illustration, which
/// plays a few passes and stays still under reduced motion.
class _TaskDetailRelationshipsEmpty extends StatelessWidget {
  const _TaskDetailRelationshipsEmpty();

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Row(
      key: const ValueKey('task-detail-relationships-empty'),
      children: [
        const AppIllustration(
          AppIllustrationKind.noTasks,
          size: 64,
          tone: AppTone.info,
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Text(
            context.l10n.taskDetailNoRelationships,
            style: tokens.typography.small.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
        ),
      ],
    );
  }
}

/// Destructive actions, kept apart at the end of the detail surface. Each
/// asks for confirmation before it runs.
class _TaskDetailDangerZone extends StatelessWidget {
  const _TaskDetailDangerZone({
    required this.task,
    required this.enabled,
    required this.actions,
  });

  final TaskBoardTask task;
  final bool enabled;
  final _TaskDetailActions actions;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return AppGroupedCard(
      children: [
        AppGroupedRow(
          key: const ValueKey('task-detail-delete'),
          leading: const AppIconTile(
            icon: LucideIcons.trash2,
            tone: AppTone.destructive,
          ),
          title: Text(
            context.l10n.taskBoardDetailDeleteTask,
            style: TextStyle(color: c.destructive, fontWeight: FontWeight.w600),
          ),
          onTap: enabled ? () => actions.onDelete(task) : null,
        ),
      ],
    );
  }
}
