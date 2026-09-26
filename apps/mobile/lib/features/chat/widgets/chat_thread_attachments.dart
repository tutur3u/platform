part of 'chat_thread_view.dart';

class _NoConversationSelected extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return _ThreadEmpty(
      title: context.l10n.chatNoConversationsTitle,
      description: context.l10n.chatNoConversationsDescription,
    );
  }
}

class _ThreadEmpty extends StatelessWidget {
  const _ThreadEmpty({required this.title, required this.description});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;
    return Center(
      child: SingleChildScrollView(
        primary: false,
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              shad.LucideIcons.messageCircle,
              color: colorScheme.mutedForeground,
              size: 34,
            ),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              description,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
