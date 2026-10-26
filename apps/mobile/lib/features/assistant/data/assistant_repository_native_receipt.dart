part of 'assistant_repository.dart';

extension AssistantNativeReceiptOperations on AssistantRepository {
  /// Resolve a prior dispatch through a fresh authorized read, never a send.
  Future<AssistantMessage?> reconcileNativeUserSubmission({
    required String actorId,
    required String wsId,
    required String chatId,
    required String requestId,
    required String text,
    required List<AssistantAttachment> attachments,
    required bool Function() isCurrent,
    String? replyToMessageId,
  }) async {
    if (AssistantChatRoute.parse(chatId).kind !=
        AssistantChatRouteKind.native) {
      return null;
    }
    bool current() => isCurrent() && currentActorId == actorId;
    if (!current()) return null;
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/chat/conversations/$chatId/messages?limit=100',
    );
    if (!current()) return null;
    final rows = response['messages'];
    if (rows is! List) {
      throw const FormatException('Invalid native message list');
    }
    final parser = ChatNdjsonStreamParser(strictNativeReceipts: true);
    final messages = rows.map(parser.decodeMessage).toList(growable: false);
    requireAssistantMessageReceipts(messages, conversationId: chatId);
    final matching = messages
        .where(
          (m) =>
              m.kind == ChatMessageKind.user &&
              assistantClientRequestId(m.metadata) == requestId,
        )
        .toList();
    if (matching.length != 1) return null;
    final saved = matching.single;
    if (!_matchesNativeUserReceipt(
      saved,
      actorId: actorId,
      requestId: requestId,
      text: text,
      attachments: attachments,
      replyToMessageId: replyToMessageId,
    )) {
      return null;
    }
    return current() ? restoreAssistantChatMessage(saved) : null;
  }
}

bool _matchesNativeUserReceipt(
  ChatMessage saved, {
  required String actorId,
  required String? requestId,
  required String text,
  required List<AssistantAttachment> attachments,
  String? replyToMessageId,
}) {
  if (saved.kind != ChatMessageKind.user ||
      saved.senderId != actorId ||
      assistantClientRequestId(saved.metadata) != requestId ||
      saved.content != text ||
      saved.replyToMessageId != replyToMessageId ||
      saved.attachments.length != attachments.length) {
    return false;
  }
  for (var i = 0; i < attachments.length; i++) {
    final expected = attachments[i];
    final actual = saved.attachments[i];
    if (actual.storagePath != expected.storagePath ||
        actual.filename != expected.name ||
        actual.contentType != expected.type ||
        actual.sizeBytes != expected.size) {
      return false;
    }
  }
  return true;
}

AssistantJsonStreamEvent _nativeUserReceiptEvent(
  ChatMessage saved, {
  required String chatId,
  required String wsId,
  required String? requestId,
  required String text,
  required List<AssistantAttachment> attachments,
  String? replyToMessageId,
  ApiMutationAdmission? admission,
}) {
  requireAssistantMessageReceipts([saved], conversationId: chatId);
  final original = assistantClientRequestId(saved.metadata);
  if (requestId == null ||
      original != requestId ||
      saved.content != text ||
      saved.replyToMessageId != replyToMessageId ||
      (admission != null &&
          !_matchesNativeUserReceipt(
            saved,
            actorId: admission.actorId,
            requestId: requestId,
            text: text,
            attachments: attachments,
            replyToMessageId: replyToMessageId,
          ))) {
    throw const FormatException('Native USER receipt differs from request');
  }
  return AssistantJsonStreamEvent({
    'type': 'saved-user-message',
    'messageId': saved.id,
    'clientRequestId': original,
    'text': saved.content,
    'message': restoreAssistantChatMessage(saved).toJson(),
    'nativeReceipt': {
      'actorId': saved.senderId,
      'workspaceId': wsId,
      'chatId': saved.conversationId,
      'requestId': original,
      'messageId': saved.id,
      'text': saved.content,
      'replyToMessageId': saved.replyToMessageId,
      'attachments': saved.attachments
          .map(
            (a) => {
              'path': a.storagePath,
              'name': a.filename,
              'type': a.contentType,
              'size': a.sizeBytes,
            },
          )
          .toList(growable: false),
    },
  });
}

/// Pending retirement uses the original tuple even after its waiter is gone.
bool matchesAssistantNativeUserAcknowledgment(
  Object? raw, {
  required String actorId,
  required String wsId,
  required String chatId,
  required String requestId,
  required Object? messageId,
  required String text,
  required List<AssistantAttachment> attachments,
  String? replyToMessageId,
}) {
  if (raw is! Map<String, dynamic> ||
      raw['actorId'] != actorId ||
      raw['workspaceId'] != wsId ||
      raw['chatId'] != chatId ||
      raw['requestId'] != requestId ||
      raw['messageId'] != messageId ||
      raw['text'] != text) {
    return false;
  }
  if (raw['replyToMessageId'] != replyToMessageId) return false;
  final received = raw['attachments'];
  if (received is! List || received.length != attachments.length) return false;
  for (var i = 0; i < attachments.length; i++) {
    final actual = received[i];
    final expected = attachments[i];
    if (actual is! Map<String, dynamic> ||
        actual['path'] != expected.storagePath ||
        actual['name'] != expected.name ||
        actual['type'] != expected.type ||
        actual['size'] != expected.size) {
      return false;
    }
  }
  return true;
}
