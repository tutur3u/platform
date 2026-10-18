part of 'assistant_repository.dart';

Stream<AssistantStreamEvent> _streamAssistantLegacyChat({
  required ApiClient api,
  required String? Function() currentActor,
  required String chatId,
  required String wsId,
  required String? workspaceContextId,
  required String modelId,
  required List<AssistantMessage> messages,
  required AssistantThinkingMode thinkingMode,
  required AssistantCreditSource creditSource,
  required String timezone,
  String? creditWsId,
}) async* {
  final user = messages.reversed.where((m) => m.role == 'user').firstOrNull;
  final requestId = user?.clientRequestId;
  final actor = currentActor();
  final text = user?.parts
      .where((p) => p.type == 'text')
      .map((p) => p.text ?? '')
      .join('\n\n')
      .trim();
  void checkActor() {
    if (actor == null || currentActor() != actor) {
      throw const ApiException(
        message: 'Legacy request actor changed',
        statusCode: 0,
      );
    }
  }

  if (user != null && (requestId == null || !isUuid(requestId))) {
    throw const FormatException('Legacy request identity is unavailable');
  }
  Future<AssistantJsonStreamEvent?> readReceipt() async {
    checkActor();
    final payload = await api.postJson('/api/ai/chat/restore', {
      'chatId': chatId,
    });
    checkActor();
    final chat = payload['chat'];
    final rows = payload['messages'];
    if (chat is! Map || chat['id'] != chatId || rows is! List) {
      throw const FormatException('Invalid legacy durable history receipt');
    }
    final matched = rows.whereType<Map<String, dynamic>>().where((row) {
      final metadata = row['metadata'];
      return row['role'] == 'USER' &&
          metadata is Map &&
          metadata['requestId'] == requestId &&
          metadata['source'] == 'Mira';
    }).toList();
    if (matched.isEmpty) return null;
    if (matched.length != 1) {
      throw const FormatException('Ambiguous legacy user receipt');
    }
    final saved = matched.single;
    final metadata = saved['metadata'] as Map;
    final originalText = metadata.containsKey('requestText')
        ? metadata['requestText']
        : saved['content'];
    if (saved['content'] is! String ||
        originalText != text ||
        saved['id'] is! String ||
        !isUuid(saved['id'] as String) ||
        (saved['creator_id'] != null && saved['creator_id'] != actor)) {
      throw const FormatException('Legacy user receipt differs from request');
    }
    return AssistantJsonStreamEvent({
      'type': 'saved-user-message',
      'messageId': saved['id'],
      'clientRequestId': requestId,
      'text': text,
    });
  }

  if (requestId != null) {
    final previous = await readReceipt();
    if (previous != null) {
      yield previous;
      yield const AssistantDoneStreamEvent();
      return;
    }
  }
  AssistantJsonStreamEvent? deferredError;
  Object? failure;
  StackTrace? failureStack;
  try {
    final response = await api.sendJsonStream('POST', '/api/ai/chat', {
      'id': chatId,
      'wsId': wsId,
      'workspaceContextId': workspaceContextId,
      'model': modelId,
      'messages': messages.map((m) => m.toJson()).toList(),
      'isMiraMode': true,
      'timezone': timezone,
      'thinkingMode': AssistantThinkingMode.thinking.name,
      'creditSource': creditSource.name,
      if (creditWsId != null) 'creditWsId': creditWsId,
      if (requestId != null) 'persistenceRequestId': requestId,
    }, accept: 'text/event-stream');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final body = await response.stream.bytesToString();
      throw ApiException(
        message: body.isEmpty ? 'Failed to stream chat' : body,
        statusCode: response.statusCode,
      );
    }
    final parser = AssistantSseParser();
    await for (final chunk in response.stream) {
      for (final event in parser.addChunk(chunk)) {
        if (event is AssistantJsonStreamEvent &&
            event.payload['type'] == 'error') {
          deferredError ??= event;
        } else if (event is! AssistantDoneStreamEvent) {
          yield event;
        }
      }
    }
    for (final event in parser.close()) {
      if (event is AssistantJsonStreamEvent &&
          event.payload['type'] == 'error') {
        deferredError ??= event;
      } else if (event is! AssistantDoneStreamEvent) {
        yield event;
      }
    }
  } on Object catch (error, stack) {
    failure = error;
    failureStack = stack;
  }
  final receipt = requestId == null ? null : await readReceipt();
  if (receipt != null) yield receipt;
  if (deferredError != null) yield deferredError;
  if (failure != null) Error.throwWithStackTrace(failure, failureStack!);
  if (requestId != null && receipt == null) {
    throw const FormatException('Legacy user persistence is unconfirmed');
  }
  yield const AssistantDoneStreamEvent();
}
