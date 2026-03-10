part of 'task_project_detail_page.dart';

class _ErrorState extends StatelessWidget {
  const _ErrorState({this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 28),
            const shad.Gap(10),
            Text(message ?? context.l10n.commonSomethingWentWrong),
          ],
        ),
      ),
    );
  }
}

class _NotFoundState extends StatelessWidget {
  const _NotFoundState({required this.title, required this.description});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.folder_off_outlined, size: 30),
            const shad.Gap(10),
            Text(title, style: theme.typography.large),
            const shad.Gap(6),
            Text(
              description,
              textAlign: TextAlign.center,
              style: theme.typography.textMuted,
            ),
          ],
        ),
      ),
    );
  }
}
