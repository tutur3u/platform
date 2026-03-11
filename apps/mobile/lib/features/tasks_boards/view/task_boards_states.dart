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

    return shad.Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Icon(
              Icons.view_kanban_outlined,
              size: 40,
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
            const shad.Gap(10),
            Text(title, textAlign: TextAlign.center),
            const shad.Gap(4),
            Text(
              description,
              textAlign: TextAlign.center,
              style: shad.Theme.of(context).typography.textMuted,
            ),
          ],
        ),
      ),
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline, size: 48),
            const shad.Gap(12),
            Text(title, textAlign: TextAlign.center),
            const shad.Gap(6),
            Text(description, textAlign: TextAlign.center),
          ],
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48),
          const shad.Gap(12),
          Text(
            error ?? context.l10n.taskBoardsLoadError,
            textAlign: TextAlign.center,
          ),
          const shad.Gap(12),
          shad.OutlineButton(
            onPressed: () => unawaited(onRetry()),
            child: Text(context.l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}
