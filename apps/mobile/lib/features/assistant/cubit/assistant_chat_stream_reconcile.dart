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
  List<AssistantAttachment> attachments,
) {
  if (state.messages.isEmpty) return false;
  final latest = state.messages.last;
  if (latest.role != 'user') return false;

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
    AssistantMessage(
      id: savedId,
      role: 'assistant',
      parts: parts,
      createdAt: streamed?.createdAt ?? DateTime.now(),
    ),
  ];
}
