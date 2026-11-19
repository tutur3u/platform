part of 'task_board_detail_page.dart';

/// One relationship kind as a captioned group of rows: each linked task
/// opens on tap and has a remove button; the last row links another task.
class _TaskRelationshipGroup extends StatelessWidget {
  const _TaskRelationshipGroup({
    required this.kind,
    required this.title,
    required this.tasks,
    required this.addLabel,
    required this.onAdd,
    required this.onRemove,
    this.onNavigate,
  });

  final _TaskRelationshipKind kind;
  final String title;
  final List<RelatedTaskInfo> tasks;
  final String addLabel;

  /// Null while the editor is busy: the add row dims and takes no taps.
  final VoidCallback? onAdd;
  final void Function(RelatedTaskInfo task)? onRemove;
  final void Function(RelatedTaskInfo task)? onNavigate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tone = switch (kind) {
      _TaskRelationshipKind.blockedBy => AppTone.destructive,
      _TaskRelationshipKind.blocking => AppTone.warning,
      _ => AppTone.info,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _TaskQuickSectionCaption(title),
        AppGroupedCard(
          children: [
            for (final task in tasks)
              AppGroupedRow(
                key: ValueKey('task-relationship-${kind.name}-${task.id}'),
                leading: AppIconTile(
                  icon: _taskRelationshipIcon(kind),
                  tone: tone,
                ),
                title: Text(
                  task.name.trim().isEmpty
                      ? l10n.taskBoardDetailUntitledTask
                      : task.name.trim(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: switch ([
                  if (task.boardName?.trim().isNotEmpty == true)
                    task.boardName!.trim(),
                  if (task.displayNumber != null) '#${task.displayNumber}',
                ]) {
                  final meta when meta.isNotEmpty => Text(meta.join(' · ')),
                  _ => null,
                },
                trailing: AppIconButton(
                  tooltip: l10n.taskBoardDetailRemoveRelationship,
                  icon: const Icon(LucideIcons.x),
                  onPressed: onRemove == null ? null : () => onRemove!(task),
                ),
                semanticLabel: onNavigate == null
                    ? null
                    : l10n.taskBoardDetailOpenRelatedTask,
                onTap: onNavigate == null ? null : () => onNavigate!(task),
              ),
            AppGroupedRow(
              key: ValueKey('task-relationship-add-${kind.name}'),
              leading: const AppIconTile(
                icon: LucideIcons.plus,
                tone: AppTone.primary,
              ),
              title: Text(addLabel),
              onTap: onAdd,
            ),
          ],
        ),
      ],
    );
  }
}
