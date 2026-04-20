part of 'task_board_detail_page.dart';

class _MoveTaskListDialog extends StatelessWidget {
  const _MoveTaskListDialog({required this.lists});

  final List<TaskBoardList> lists;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(context.l10n.taskBoardDetailMoveTask),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 360),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...lists.map((list) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: shad.OutlineButton(
                    onPressed: () => Navigator.of(context).pop(list.id),
                    child: _TaskBoardListOptionRow(list: list),
                  ),
                );
              }),
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.l10n.commonCancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskListPickerDialog extends StatelessWidget {
  const _TaskListPickerDialog({
    required this.title,
    required this.lists,
  });

  final String title;
  final List<TaskBoardList> lists;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(title),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 360),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...lists.map((list) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: shad.GhostButton(
                    onPressed: () => Navigator.of(context).pop(list.id),
                    child: _TaskBoardListOptionRow(list: list),
                  ),
                );
              }),
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.l10n.commonCancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskRelationshipPickerDialog extends StatefulWidget {
  const _TaskRelationshipPickerDialog({
    required this.title,
    required this.tasks,
  });

  final String title;
  final List<TaskLinkOption> tasks;

  @override
  State<_TaskRelationshipPickerDialog> createState() =>
      _TaskRelationshipPickerDialogState();
}

class _TaskRelationshipPickerDialogState
    extends State<_TaskRelationshipPickerDialog> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final normalizedQuery = _query.trim().toLowerCase();
    final filtered = widget.tasks
        .where((task) {
          if (normalizedQuery.isEmpty) return true;
          return task.name.toLowerCase().contains(normalizedQuery) ||
              (task.listName?.toLowerCase().contains(normalizedQuery) ??
                  false) ||
              (task.boardName?.toLowerCase().contains(normalizedQuery) ??
                  false);
        })
        .toList(growable: false);

    return shad.AlertDialog(
      title: Text(widget.title),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            shad.TextField(
              contextMenuBuilder: platformTextContextMenuBuilder(),
              hintText: context.l10n.taskBoardDetailSearchTasks,
              onChanged: (value) => setState(() => _query = value),
            ),
            const shad.Gap(10),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 360),
              child: filtered.isEmpty
                  ? Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        context.l10n.taskBoardDetailNoMatchingTasks,
                        style: shad.Theme.of(context).typography.textMuted,
                      ),
                    )
                  : ListView.separated(
                      shrinkWrap: true,
                      itemCount: filtered.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final task = filtered[index];
                        final title = task.name.trim().isNotEmpty
                            ? task.name.trim()
                            : context.l10n.taskBoardDetailUntitledTask;
                        final metadata = [
                          if (task.boardName?.trim().isNotEmpty == true)
                            task.boardName!.trim(),
                          if (task.listName?.trim().isNotEmpty == true)
                            task.listName!.trim(),
                        ];

                        return shad.GhostButton(
                          onPressed: () => Navigator.of(context).pop(task.id),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (metadata.isNotEmpty)
                                Text(
                                  metadata.join(' · '),
                                  style:
                                      shad.Theme.of(
                                        context,
                                      ).typography.xSmall.copyWith(
                                        color: shad.Theme.of(
                                          context,
                                        ).colorScheme.mutedForeground,
                                      ),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
            const shad.Gap(10),
            shad.OutlineButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(context.l10n.commonCancel),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskBoardListOptionRow extends StatelessWidget {
  const _TaskBoardListOptionRow({required this.list});

  final TaskBoardList list;

  @override
  Widget build(BuildContext context) {
    final label = list.name?.trim().isNotEmpty == true
        ? list.name!.trim()
        : context.l10n.taskBoardDetailUntitledList;
    final style = _taskBoardListVisualStyle(context, list);

    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: style.accent,
            shape: BoxShape.circle,
          ),
        ),
        const shad.Gap(8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, overflow: TextOverflow.ellipsis),
              Text(
                style.statusLabel,
                style: shad.Theme.of(context).typography.small.copyWith(
                  fontSize: 11,
                  color: style.statusBadge.textColor,
                ),
              ),
            ],
          ),
        ),
        Icon(
          style.statusIcon,
          size: 16,
          color: style.statusBadge.textColor,
        ),
      ],
    );
  }
}
