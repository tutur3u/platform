part of 'chat_thread_view.dart';

/// Detail-pane state before a conversation is chosen.
class ChatNoConversationSelected extends StatelessWidget {
  const ChatNoConversationSelected({super.key});

  @override
  Widget build(BuildContext context) {
    return _ThreadEmpty(
      title: context.l10n.chatSelectConversationTitle,
      description: context.l10n.chatSelectConversationDescription,
      illustration: const AppIllustration(AppIllustrationKind.conversations),
    );
  }
}

/// A new conversation: who it is with and a nudge to say hello.
class _ThreadStart extends StatelessWidget {
  const _ThreadStart({required this.conversation, required this.currentUserId});

  final ChatConversation conversation;
  final String? currentUserId;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        primary: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xxl),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ChatConversationAvatar(
                    conversation: conversation,
                    currentUserId: currentUserId,
                    size: 64,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    conversation.displayTitle(fallback: l10n.chatUntitled),
                    textAlign: TextAlign.center,
                    style: tokens.typography.large.copyWith(
                      color: tokens.colorScheme.foreground,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    l10n.chatNoMessagesDescription,
                    textAlign: TextAlign.center,
                    style: tokens.typography.small.copyWith(
                      color: tokens.colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Message placeholders while a thread loads.
class _ThreadSkeleton extends StatelessWidget {
  const _ThreadSkeleton();

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    Widget bubble(double width, {required bool mine}) => Align(
      alignment: mine
          ? AlignmentDirectional.centerEnd
          : AlignmentDirectional.centerStart,
      child: Padding(
        padding: EdgeInsetsDirectional.only(
          start: mine ? 0 : chatAvatarGutter,
          bottom: AppSpacing.md,
        ),
        child: FractionallySizedBox(
          widthFactor: width,
          child: Container(
            height: 44,
            decoration: BoxDecoration(
              color: colors.muted.withValues(alpha: mine ? 0.9 : 0.6),
              borderRadius: BorderRadius.circular(AppRadius.card - 4),
            ),
          ),
        ),
      ),
    );
    return Semantics(
      label: context.l10n.commonLoading,
      child: ExcludeSemantics(
        child: ListView(
          reverse: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            bubble(0.5, mine: true),
            bubble(0.62, mine: false),
            bubble(0.4, mine: false),
            bubble(0.55, mine: true),
            bubble(0.7, mine: false),
          ],
        ),
      ),
    );
  }
}

class _ThreadEmpty extends StatelessWidget {
  const _ThreadEmpty({
    required this.title,
    required this.description,
    this.icon = LucideIcons.messageCircle,
    this.tone = AppTone.neutral,
    this.illustration,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String description;
  final IconData icon;
  final AppTone tone;
  final Widget? illustration;
  final String? actionLabel;
  final VoidCallback? onAction;

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
              illustration: illustration,
              actionLabel: actionLabel,
              onAction: onAction,
            ),
          ),
        );
      },
    );
  }
}
