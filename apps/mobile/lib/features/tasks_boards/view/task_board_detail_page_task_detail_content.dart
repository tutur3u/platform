part of 'task_board_detail_page.dart';

/// Body width from which the task detail screen splits into a main column
/// and a properties column.
const double _taskDetailSplitWidth = 720;

/// The task detail building blocks in reading order: the title, one line
/// of property chips, the description, every property as rows (folded by
/// default), relationships, then the destructive actions apart at the end.
/// Opening a task reads its description first; the chips change a
/// property in one tap without unfolding the full list.
///
/// The phone sheet and the detail screen both render this. From
/// [_taskDetailSplitWidth] the screen puts the properties, unfolded, and
/// the destructive actions in a side column next to the title,
/// description and relationships.
class _TaskDetailContent extends StatelessWidget {
  const _TaskDetailContent({
    required this.task,
    required this.board,
    required this.lists,
    required this.actions,
    required this.isPersonalWorkspace,
    required this.enabled,
    required this.inSheet,
    this.showTitle = true,
    this.reference,
  });

  final TaskBoardTask task;
  final TaskBoardDetail? board;
  final List<TaskBoardList> lists;
  final _TaskDetailActions actions;
  final bool isPersonalWorkspace;

  /// False while a board mutation runs: controls dim and take no taps.
  final bool enabled;

  /// On the sheet, relationships open on demand and the editor is shorter.
  final bool inSheet;

  /// False when the surface's own title bar already shows the title.
  final bool showTitle;
  final String? reference;

  @override
  Widget build(BuildContext context) {
    final list = lists.where((list) => list.id == task.listId).firstOrNull;
    final board = this.board;
    final header = <Widget>[
      if (showTitle) ...[
        _TaskDetailTitleField(
          task: task,
          enabled: enabled,
          onRename: actions.onRename,
        ),
        const SizedBox(height: AppSpacing.sm),
      ],
      _TaskDetailMetaChips(
        task: task,
        board: board,
        list: list,
        enabled: enabled,
        actions: actions,
        reference: reference,
      ),
    ];
    // Fleet tasks lead with their status, owner, ETA and freshness.
    final fleet = fleetMetaOrNull(task, listStatus: list?.status);
    final fleetCard = fleet == null ? null : FleetTaskDetailCard(meta: fleet);
    final propertiesCard = _TaskDetailPropertiesCard(
      task: task,
      board: board,
      list: list,
      enabled: enabled,
      actions: actions,
    );
    final description = board == null
        ? null
        : _TaskDetailDescriptionSection(
            task: task,
            board: board,
            lists: lists,
            isPersonalWorkspace: isPersonalWorkspace,
            editorHeight: inSheet ? 300 : 420,
            onNavigateRelatedTask: actions.onNavigateRelatedTask,
          );
    final relationships = board == null
        ? null
        : _TaskDetailRelationshipsSection(
            task: task,
            board: board,
            lists: lists,
            isPersonalWorkspace: isPersonalWorkspace,
            collapsible: inSheet,
            onNavigateRelatedTask: actions.onNavigateRelatedTask,
          );
    final danger = _TaskDetailDangerZone(
      task: task,
      enabled: enabled,
      actions: actions,
    );

    // Fleet tasks lead with their status card, so it stays above the
    // description on one column.
    Widget singleColumn() => Column(
      key: const ValueKey('task-detail-single-column'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...header,
        if (fleetCard != null) ...[
          const SizedBox(height: AppLayout.itemGap),
          fleetCard,
        ],
        if (description != null) ...[
          const SizedBox(height: AppLayout.sectionGap),
          description,
        ],
        const SizedBox(height: AppLayout.sectionGap),
        // Keyed so the unfolded state survives sections appearing above it.
        _TaskDetailPropertiesDisclosure(
          key: const ValueKey('task-detail-properties'),
          properties: propertiesCard,
        ),
        if (relationships != null) ...[
          const SizedBox(height: AppLayout.sectionGap),
          relationships,
        ],
        const SizedBox(height: AppLayout.sectionGap * 2),
        danger,
      ],
    );

    if (inSheet) return singleColumn();
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < _taskDetailSplitWidth) return singleColumn();
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                key: const ValueKey('task-detail-main-column'),
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ...header,
                  if (description != null) ...[
                    const SizedBox(height: AppLayout.sectionGap),
                    description,
                  ],
                  if (relationships != null) ...[
                    const SizedBox(height: AppLayout.sectionGap),
                    relationships,
                  ],
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.xxl),
            SizedBox(
              width: math.min(380, constraints.maxWidth * 0.4),
              child: Column(
                key: const ValueKey('task-detail-side-column'),
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (fleetCard != null) ...[
                    fleetCard,
                    const SizedBox(height: AppLayout.itemGap),
                  ],
                  propertiesCard,
                  const SizedBox(height: AppLayout.sectionGap * 2),
                  danger,
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
