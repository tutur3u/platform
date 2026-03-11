part of 'task_board_detail_page.dart';

class _TaskBoardDetailErrorState extends StatelessWidget {
  const _TaskBoardDetailErrorState({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 30),
            const shad.Gap(10),
            Text(message, textAlign: TextAlign.center),
            const shad.Gap(12),
            shad.OutlineButton(
              onPressed: () => unawaited(onRetry()),
              child: Text(context.l10n.commonRetry),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoListsState extends StatelessWidget {
  const _NoListsState({required this.onCreateList});

  final VoidCallback onCreateList;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.view_kanban_outlined, size: 30),
            const shad.Gap(10),
            Text(context.l10n.taskBoardDetailNoListsTitle),
            const shad.Gap(6),
            Text(
              context.l10n.taskBoardDetailNoListsDescription,
              textAlign: TextAlign.center,
            ),
            const shad.Gap(12),
            shad.PrimaryButton(
              onPressed: onCreateList,
              child: Text(context.l10n.taskBoardDetailCreateList),
            ),
          ],
        ),
      ),
    );
  }
}
