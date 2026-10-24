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
    builder: (context, _) => AssistantThemeScope(
      value: _chatTheme.value,
      child: Builder(
        builder: (context) =>
            AssistantThemeBackdrop(child: _buildPage(context)),
      ),
    ),
  );

  Future<void> _showChatTheme() => showAppSheet<void>(
    context: context,
    builder: (_) => AssistantThemeSheet.controlled(controller: _chatTheme),
  );
}
