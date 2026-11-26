part of 'chat_cubit.dart';

/// Publishes the viewer's typing on the open thread's room socket. Web's
/// room protocol carries it as `{t: typing, on}`; receivers already show it.
extension ChatCubitTyping on ChatCubit {
  /// Reports the composer text for the open thread. Typing starts with the
  /// first character and is refreshed and ended by [ChatTypingPublisher].
  void reportTyping(String text) {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    final conversation = state.selectedConversation;
    if (wsId == null ||
        conversation == null ||
        conversation.isReadOnlyAgent ||
        conversation.type == ChatConversationType.ai) {
      return;
    }
    final current = _typing;
    if (current != null && current.conversationId != conversation.id) {
      stopTyping();
    }
    final publisher =
        _typing?.publisher ??
        ChatTypingPublisher(
          send: (on) =>
              _realtimeClient.sendTyping(wsId, conversation.id, typing: on),
        );
    _typing = (conversationId: conversation.id, publisher: publisher);
    publisher.onTextChanged(text);
  }

  /// Ends the viewer's typing signal: on send, blur, leaving the thread and
  /// closing.
  void stopTyping() {
    final current = _typing;
    _typing = null;
    current?.publisher.dispose();
  }
}
