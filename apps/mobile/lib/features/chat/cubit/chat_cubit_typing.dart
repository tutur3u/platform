part of 'chat_cubit.dart';

/// Typing on the open thread's room socket, both ways. The viewer's typing
/// goes out as web's room frame `{t: typing, on}`; other members' typing
/// comes in through [ChatTypingRoster], which expires it and scopes it to
/// the open conversation.
extension ChatCubitTyping on ChatCubit {
  /// Reports the composer text for the open thread. Typing starts with the
  /// first character and is refreshed, spaced and ended by
  /// [ChatTypingPublisher].
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
    if (_typing case final current?
        when current.conversationId != conversation.id) {
      endTyping();
    }
    final typing = _typing ??= (
      conversationId: conversation.id,
      publisher: ChatTypingPublisher(
        send: (on) =>
            _realtimeClient.sendTyping(wsId, conversation.id, typing: on),
        now: _now,
      ),
      lifecycle: _endTypingInBackground(),
    );
    typing.publisher.onTextChanged(text);
  }

  /// Ends the viewer's typing after a send or blur. The publisher is kept,
  /// so the next keystroke still respects its frame gap.
  void stopTyping() => _typing?.publisher.stop();

  /// Ends the viewer's typing at once and drops the publisher: leaving the
  /// room, closing, or the app leaving the foreground, where timers may not
  /// run to send a held frame.
  void endTyping() {
    final typing = _typing;
    _typing = null;
    typing?.lifecycle?.dispose();
    typing?.publisher.dispose();
  }

  AppLifecycleListener? _endTypingInBackground() {
    try {
      return AppLifecycleListener(
        onInactive: endTyping,
        onHide: endTyping,
        onPause: endTyping,
      );
    } on Object {
      // No widgets binding (plain unit tests): nothing to watch.
      return null;
    }
  }

  /// Leaves the old room's typing before its socket closes, so the `false`
  /// frame can still go out, and tracks typists for [conversationId].
  void _switchTypingRoom(String? conversationId) {
    endTyping();
    _typists.reset(conversationId);
  }

  void _disposeTyping() {
    endTyping();
    _typists.dispose();
  }

  void _applyRemoteTyping(ChatRealtimeTypingEvent event) {
    final userId = event.actorUserId;
    if (userId == null) return;
    _typists.apply(event.conversationId, userId, typing: event.isTyping);
  }

  void _publishTypists(Set<String> userIds) {
    if (isClosed) return;
    emit(state.copyWith(typingUserIds: userIds));
  }
}
