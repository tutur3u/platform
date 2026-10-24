part of 'assistant_page.dart';

extension _AssistantPageMessageActions on _AssistantPageState {
  bool Function() _messageActionScope(AssistantChatState chatState) {
    final scope = _localScope();
    final selection = _localCubit.selectionVersion;
    final version = _chatCubit.attachmentScopeVersion;
    final conversation = _activeConversationKey(chatState);
    return () {
      final local = _localCubit.state;
      final current = local.local || local.blocked
          ? local.chat
          : _chatCubit.state;
      return mounted &&
          scope != null &&
          scope == _localScope() &&
          selection == _localCubit.selectionVersion &&
          version == _chatCubit.attachmentScopeVersion &&
          conversation == _activeConversationKey(current);
    };
  }

  void _replyToMessage(String messageId, bool Function() current) {
    if (!current() || !_chatCubit.setReplyTarget(messageId)) return;
    _restoreComposerAndFocus();
  }

  Future<void> _reactToMessage(
    String messageId,
    String? reaction,
    bool Function() current,
  ) async {
    if (!current()) return;
    final result = reaction == null
        ? await _chatCubit.refreshReactions(messageId, isCurrent: current)
        : await _chatCubit.toggleReaction(
            messageId,
            reaction,
            isCurrent: current,
          );
    if (!mounted || !current()) return;
    if (result == AssistantReactionResult.unknown ||
        result == AssistantReactionResult.refreshRequired ||
        result == AssistantReactionResult.unavailable) {
      _showInlineNotice(context.l10n.assistantReactionUnconfirmed);
    }
  }
}
