part of 'task_boards_view.dart';

class _BoardsToolbarCard extends StatelessWidget {
  const _BoardsToolbarCard({
    required this.title,
    required this.filterLabel,
    required this.boardCount,
    required this.isRefreshing,
    required this.onOpenFilter,
  });

  final String title;
  final String filterLabel;
  final int boardCount;
  final bool isRefreshing;
  final VoidCallback onOpenFilter;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final countLabel = NumberFormat.compact().format(boardCount);

    return shad.Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.typography.large.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const shad.Gap(6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      shad.OutlineBadge(
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(shad.LucideIcons.filter, size: 14),
                            const SizedBox(width: 6),
                            Text(filterLabel),
                          ],
                        ),
                      ),
                      shad.OutlineBadge(child: Text(countLabel)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            if (isRefreshing)
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
              Tooltip(
                message: filterLabel,
                child: shad.IconButton.ghost(
                  icon: const Icon(shad.LucideIcons.slidersHorizontal),
                  onPressed: onOpenFilter,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

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
