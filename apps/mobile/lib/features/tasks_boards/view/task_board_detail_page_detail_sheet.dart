part of 'task_board_detail_page.dart';

/// Sections of the embedded task editor.
enum _TaskBoardTaskDetailSection { information, description, relationships }

/// The task detail screen: the board page's detail pane for one task.
///
/// It renders the same [_TaskDetailContent] as the phone sheet, in one
/// scrolling page that splits into a main and a properties column on wide
/// bodies. The shell's top navbar shows the title, which edits in place, and
/// the floating dock's Back closes the screen. Without the shell, the
/// title shows in the body and a Back bar replaces the dock.
class _TaskBoardTaskDetailFullscreenView extends StatelessWidget {
  const _TaskBoardTaskDetailFullscreenView({
    required this.task,
    required this.board,
    required this.lists,
    required this.isPersonalWorkspace,
    required this.actions,
    required this.onClose,
    super.key,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final bool isPersonalWorkspace;
  final _TaskDetailActions actions;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final boardRoute = Routes.taskBoardDetailPath(board.id);
    final hasShellMiniNav = lookupShellMiniNavCubit(context) != null;
    final c = AppTokens.of(context).colorScheme;
    final busy = context.select<TaskBoardDetailCubit, bool>(
      (cubit) => cubit.state.isMutating,
    );

    return Stack(
      children: [
        Positioned.fill(child: ColoredBox(color: c.background)),
        ShellTitleOverride(
          ownerId: 'task-board-task-title-${task.id}',
          locations: {boardRoute},
          title: _taskBoardTaskTitle(context, task),
          showLeadingBrand: false,
          showAvatar: false,
          onTitleSubmitted: (title) async {
            final next = title.trim();
            if (next.isEmpty || next == (task.name ?? '').trim()) return;
            actions.onRename(task, next);
          },
        ),
        ShellMiniNav(
          ownerId: 'task-board-task-mini-nav-${task.id}',
          locations: {boardRoute},
          deepLinkBackRoute: boardRoute,
          items: [
            ShellMiniNavItemSpec(
              id: 'back',
              icon: Icons.chevron_left_rounded,
              label: context.l10n.navBack,
              callbackToken: 'task-back-${task.id}',
              onPressed: onClose,
            ),
          ],
        ),
        Column(
          children: [
            Expanded(
              child: AppPageListView(
                key: ValueKey('task-detail-body-${task.id}'),
                kind: AppPageKind.root,
                children: [
                  _TaskDetailContent(
                    task: task,
                    board: board,
                    lists: lists,
                    actions: actions,
                    isPersonalWorkspace: isPersonalWorkspace,
                    enabled: !busy,
                    inSheet: false,
                    showTitle: !hasShellMiniNav,
                    reference: _taskReference(task, board),
                  ),
                ],
              ),
            ),
            if (!hasShellMiniNav) _TaskDetailFallbackBackBar(onBack: onClose),
          ],
        ),
      ],
    );
  }
}

/// Back for the detail screen outside the shell, where no dock owns it.
class _TaskDetailFallbackBackBar extends StatelessWidget {
  const _TaskDetailFallbackBackBar({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.background,
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xs,
          ),
          child: Align(
            alignment: AlignmentDirectional.centerStart,
            child: AppButton.ghost(
              key: const ValueKey('task-detail-back'),
              onPressed: onBack,
              leading: const Icon(LucideIcons.chevronLeft),
              child: Text(context.l10n.navBack),
            ),
          ),
        ),
      ),
    );
  }
}

String _taskBoardTaskTitle(BuildContext context, TaskBoardTask task) {
  final title = task.name?.trim();
  return title == null || title.isEmpty
      ? context.l10n.taskBoardDetailUntitledTask
      : title;
}
