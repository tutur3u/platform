part of 'chat_thread_view.dart';

class _NoConversationSelected extends StatelessWidget {
  const _NoConversationSelected();

  @override
  Widget build(BuildContext context) {
    return _ThreadEmpty(
      title: context.l10n.chatNoConversationsTitle,
      description: context.l10n.chatNoConversationsDescription,
    );
  }
}

class _ThreadEmpty extends StatelessWidget {
  const _ThreadEmpty({
    required this.title,
    required this.description,
    this.icon = LucideIcons.messageCircle,
    this.tone = AppTone.neutral,
  });

  final String title;
  final String description;
  final IconData icon;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          primary: false,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: AppStateMessage(
              icon: icon,
              title: title,
              message: description,
              tone: tone,
            ),
          ),
        );
      },
    );
  }
}
