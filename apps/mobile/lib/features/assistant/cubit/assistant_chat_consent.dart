part of 'assistant_chat_cubit.dart';

/// The ids a "Report this response" request names for one Mira reply.
typedef AssistantReplyReportTarget = ({
  String wsId,
  String conversationId,
  String messageId,
});

extension AssistantChatConsent on AssistantChatCubit {
  /// Whether a send must first wait for the user's AI data consent. Checked
  /// synchronously so a consented send keeps its timing.
  bool get _aiConsentPending => !(_aiConsentGate?.granted ?? true);

  /// Asks for consent; true only after it is stored and the send is current.
  Future<bool> _admitAiConsent(bool Function() current) async {
    final gate = _aiConsentGate;
    if (gate == null || gate.granted) return current();
    return await gate.request() && current();
  }

  /// A server refusal for missing consent forgets the cached grant and asks
  /// the user again.
  void _observeAiConsentFailure(Object error) {
    if (isMiraAiConsentRequired(error)) _aiConsentGate?.consentRequired();
  }

  /// The report target for a saved Mira reply in the open conversation, or
  /// null while the reply has no persisted id (streaming or optimistic).
  AssistantReplyReportTarget? replyReportTarget(String messageId) {
    final wsId = state.workspaceId;
    final chatId = state.storedChatId;
    if (_closing ||
        isClosed ||
        state.status == AssistantChatStatus.restoring ||
        wsId == null ||
        chatId == null ||
        state.chat?.id != chatId ||
        !isUuid(messageId) ||
        (state.status == AssistantChatStatus.streaming &&
            _activeAssistantMessageId == messageId)) {
      return null;
    }
    final message = state.messages.where((m) => m.id == messageId).firstOrNull;
    if (message == null ||
        message.role != 'assistant' ||
        !message.isPersisted) {
      return null;
    }
    try {
      final route = AssistantChatRoute.parse(chatId);
      return (
        wsId: wsId,
        conversationId: route.conversationId,
        messageId: messageId,
      );
    } on FormatException {
      return null;
    }
  }
}
