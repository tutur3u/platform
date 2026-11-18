part of 'assistant_page.dart';

extension _AssistantPageTheme on _AssistantPageState {
  void _syncThemeActor({bool force = false}) {
    _chatThemeActor.syncActor(_currentActor(), force: force);
  }

  void _disposeChatTheme() {
    _chatTheme.dispose();
    unawaited(_chatThemeActor.closeAfter(_chatTheme.writesDrained));
  }

  Widget _themedPage(BuildContext context) => ListenableBuilder(
    listenable: _chatTheme,
    builder: (context, _) {
      final customAppearance =
          _chatTheme.value != const AssistantThemePreferences();
      final chat = Builder(builder: _buildPage);
      return Stack(
        fit: StackFit.expand,
        children: [
          NotificationListener<Notification>(
            onNotification: (notification) =>
                _showsConversations &&
                (notification is ScrollNotification ||
                    notification is ScrollMetricsNotification),
            child: Offstage(
              offstage: _showsConversations,
              child: ExcludeFocus(
                excluding: _showsConversations,
                child: AssistantThemeScope(
                  value: _chatTheme.value,
                  applyColors: customAppearance,
                  child: AssistantThemeBackdrop(
                    pageColor: customAppearance
                        ? null
                        : AppTokens.of(context).colorScheme.background,
                    child: chat,
                  ),
                ),
              ),
            ),
          ),
          if (_showsConversations) ...[
            ShellTitleOverride(
              ownerId: 'assistant-conversations',
              locations: const {Routes.assistantConversations},
              title: context.l10n.assistantConversationsTitle,
            ),
            ShellChromeActions(
              ownerId: 'assistant-conversations-back',
              locations: const {Routes.assistantConversations},
              onBack: _conversationsBack,
            ),
            _buildConversationsPage(),
          ],
        ],
      );
    },
  );

  Future<void> _showChatTheme() => showAppSheet<void>(
    context: context,
    builder: (_) => AssistantThemeSheet.controlled(controller: _chatTheme),
  );
}
