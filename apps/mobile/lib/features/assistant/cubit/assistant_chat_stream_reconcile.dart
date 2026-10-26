part of 'assistant_chat_cubit.dart';

List<AssistantMessage> _withoutEmptyAssistantReply(
  List<AssistantMessage> messages,
  String? activeId,
) {
  if (activeId == null) return messages;
  return messages
      .where((message) => message.id != activeId || message.parts.isNotEmpty)
      .toList(growable: false);
}

bool _matchesLatestQueuedMessage(
  AssistantChatState state,
  String combined,
  List<AssistantAttachment> attachments, {
  String? replyToMessageId,
}) {
  if (state.messages.isEmpty) return false;
  final latest = state.messages.last;
  if (latest.role != 'user') return false;
  if (latest.replyToMessageId != replyToMessageId) return false;

  final latestText = latest.parts
      .where((part) => part.type == 'text')
      .map((part) => part.text ?? '')
      .join('\n\n')
      .trim();
  if (latestText != combined.trim()) return false;

  final existingAttachmentIds =
      (state.attachmentsByMessageId[latest.id] ?? const [])
          .map((attachment) => attachment.id)
          .toList(growable: false)
        ..sort();
  final queuedAttachmentIds =
      attachments.map((attachment) => attachment.id).toList(growable: false)
        ..sort();
  return listEquals(existingAttachmentIds, queuedAttachmentIds);
}

List<AssistantMessage> _reconcileSavedAssistantMessage(
  List<AssistantMessage> messages, {
  required String? streamedId,
  required String savedId,
  required String savedText,
}) {
  final streamed = messages
      .where((message) => message.id == streamedId)
      .firstOrNull;
  final parts = streamed != null && streamed.parts.isNotEmpty
      ? streamed.parts
      : savedText.isEmpty
      ? const <AssistantMessagePart>[]
      : <AssistantMessagePart>[
          AssistantMessagePart(type: 'text', text: savedText),
        ];
  if (parts.isEmpty) {
    return messages
        .where((message) => message.id != streamedId && message.id != savedId)
        .toList(growable: false);
  }
  return [
    ...messages.where(
      (message) => message.id != streamedId && message.id != savedId,
    ),
    (streamed ?? const AssistantMessage(id: '', role: 'assistant')).copyWith(
      id: savedId,
      parts: parts,
      createdAt: streamed?.createdAt ?? DateTime.now(),
    ),
  ];
}

extension _AssistantChatSavedBatch on AssistantChatCubit {
  List<AssistantMessage> _applyNativeUserReceipt(
    List<AssistantMessage> messages,
    Map<String, dynamic> payload,
    Map<String, List<AssistantAttachment>> attachments,
  ) {
    final raw = payload['message'];
    final row = messages.where((m) => m.id == payload['messageId']).firstOrNull;
    if (raw is! Map<String, dynamic> ||
        row == null ||
        !matchesAssistantNativeUserAcknowledgment(
          payload['nativeReceipt'],
          actorId: _repository.currentActorId ?? '',
          wsId: state.workspaceId ?? '',
          chatId: state.storedChatId ?? '',
          requestId: row.clientRequestId ?? '',
          messageId: row.id,
          text: payload['text'] as String,
          attachments: attachments[row.id] ?? const [],
          replyToMessageId: row.replyToMessageId,
        )) {
      return messages;
    }
    final receipt = AssistantMessage.fromJson(raw);
    if (receipt.id != row.id ||
        receipt.role != row.role ||
        receipt.clientRequestId != row.clientRequestId) {
      return messages;
    }
    return messages
        .map(
          (message) => message.id == row.id
              ? message.copyWith(
                  isPersisted: true,
                  reactions: receipt.reactions,
                  replyToMessageId: receipt.replyToMessageId,
                )
              : message,
        )
        .toList(growable: false);
  }

  void _reconcileSavedMessage(Map<String, dynamic> payload) {
    final savedId = payload['messageId'] as String?;
    if (savedId == null || savedId.isEmpty) return;
    final result = _reconcileSavedAssistantMessage(
      state.messages,
      streamedId: _activeAssistantMessageId,
      savedId: savedId,
      savedText: payload['text'] as String? ?? '',
    );
    _activeAssistantMessageId = savedId;
    _emitIfOpen(state.copyWith(messages: result));
  }

  void _reconcileSavedMessages(Map<String, dynamic> payload) {
    final saved = (payload['messages'] as List)
        .map(
          (row) =>
              AssistantMessage.fromJson(Map<String, dynamic>.from(row as Map)),
        )
        .toList(growable: false);
    final savedIds = saved.map((message) => message.id).toSet();
    _emitIfOpen(
      state.copyWith(
        messages: [
          ...state.messages.where(
            (message) =>
                message.id != _activeAssistantMessageId &&
                !savedIds.contains(message.id),
          ),
          ...saved.map((message) {
            final prior = state.messages
                .where((m) => m.id == message.id)
                .firstOrNull;
            return message.copyWith(
              reactionRefreshRequired: prior?.reactionRefreshRequired,
            );
          }),
        ],
      ),
    );
    _activeAssistantMessageId = saved.lastOrNull?.id;
  }
}
