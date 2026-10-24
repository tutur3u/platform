part of 'assistant_page.dart';

extension _AssistantPageTheme on _AssistantPageState {
  void _syncThemeActor({bool force = false}) {
    final actor = _currentActor();
    final authenticated = context.read<AuthCubit>().state.user?.id;
    final current = actor == authenticated ? actor : null;
    if (force || _chatThemeActor.value?.actorId != current) {
      _chatThemeActor.value = current == null
          ? null
          : AssistantThemeActor(current);
    }
  }

  Widget _themedPage(BuildContext context) => ListenableBuilder(
    listenable: _chatTheme,
    builder: (context, _) => AssistantThemeScope(
      value: _chatTheme.value,
      child: Builder(
        builder: (context) {
          final colors = AssistantThemeScope.of(context);
          final theme = Theme.of(context);
          return Theme(
            data: theme.copyWith(
              colorScheme: theme.colorScheme.copyWith(
                onSurface: colors.foreground,
                onSurfaceVariant: colors.mutedForeground,
              ),
              textTheme: theme.textTheme.apply(
                bodyColor: colors.foreground,
                displayColor: colors.foreground,
              ),
            ),
            child: AssistantThemeBackdrop(child: _buildPage(context)),
          );
        },
      ),
    ),
  );

  Future<void> _showChatTheme() => showAppSheet<void>(
    context: context,
    builder: (_) => AssistantThemeSheet.controlled(controller: _chatTheme),
  );
}
