part of 'task_boards_view.dart';

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.filter});

  final TaskBoardsFilter filter;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = switch (filter) {
      TaskBoardsFilter.all => l10n.taskBoardsEmptyTitle,
      TaskBoardsFilter.active => l10n.taskBoardsEmptyTitle,
      TaskBoardsFilter.archived => l10n.taskBoardsEmptyArchivedTitle,
      TaskBoardsFilter.recentlyDeleted => l10n.taskBoardsEmptyDeletedTitle,
    };
    final description = switch (filter) {
      TaskBoardsFilter.all => l10n.taskBoardsEmptyDescription,
      TaskBoardsFilter.active => l10n.taskBoardsEmptyDescription,
      TaskBoardsFilter.archived => l10n.taskBoardsEmptyArchivedDescription,
      TaskBoardsFilter.recentlyDeleted =>
        l10n.taskBoardsEmptyDeletedDescription,
    };

    return TaskSurfaceMessageCard(
      icon: Icons.view_kanban_outlined,
      title: title,
      description: description,
      accentColor: const Color(0xFF2563EB),
    );
  }
}

class _AccessDeniedView extends StatelessWidget {
  const _AccessDeniedView({
    required this.title,
    required this.description,
  });

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: TaskSurfaceMessageCard(
          icon: Icons.lock_outline,
          title: title,
          description: description,
          accentColor: const Color(0xFF64748B),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry, this.error});

  final String? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: TaskSurfaceMessageCard(
          icon: Icons.error_outline,
          title: context.l10n.taskBoardsLoadError,
          description: error ?? context.l10n.commonSomethingWentWrong,
          accentColor: shad.Theme.of(context).colorScheme.destructive,
          action: shad.OutlineButton(
            onPressed: () => unawaited(onRetry()),
            child: Text(context.l10n.commonRetry),
          ),
        ),
      ),
    );
  }
}
