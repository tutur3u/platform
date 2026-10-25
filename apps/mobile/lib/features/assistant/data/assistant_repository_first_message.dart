part of 'assistant_repository.dart';

extension AssistantFirstMessageOperations on AssistantRepository {
  Stream<AssistantStreamEvent> _firstChatDispatchStream({
    required AssistantFirstMessageCreation creation,
    required String chatId,
    required String wsId,
    required List<AssistantMessage> messages,
    required String timezone,
    required ApiMutationAdmission admission,
  }) {
    var cancelled = false;
    var acknowledged = false;
    late final StreamSubscription<AssistantStreamEvent> subscription;
    late final StreamController<AssistantStreamEvent> controller;
    controller = StreamController<AssistantStreamEvent>(
      onListen: () {
        subscription =
            _streamFirstChat(
              creation: AssistantFirstMessageCreation(
                creation.settings,
                () => !cancelled && creation.isCurrent(),
              ),
              chatId: chatId,
              wsId: wsId,
              messages: messages,
              timezone: timezone,
              admission: admission,
            ).listen(
              (event) {
                if (event is AssistantChatCreatedStreamEvent) {
                  acknowledged = true;
                }
                if (!cancelled) controller.add(event);
              },
              onError: (Object error, StackTrace stack) {
                if (!cancelled) controller.addError(error, stack);
              },
              onDone: () {
                unawaited(controller.close());
              },
            );
      },
      onCancel: () {
        cancelled = true;
        final cleanup = subscription.cancel();
        if (acknowledged) return cleanup;
        // A bounded in-flight HTTP request remains observed, but cannot keep
        // workspace departure waiting or bind a late creation receipt.
        unawaited(
          cleanup.catchError((Object error, StackTrace stack) {
            Zone.current.handleUncaughtError(error, stack);
          }),
        );
      },
    );
    return controller.stream;
  }

  Stream<AssistantStreamEvent> _streamFirstChat({
    required AssistantFirstMessageCreation creation,
    required String chatId,
    required String wsId,
    required List<AssistantMessage> messages,
    required String timezone,
    required ApiMutationAdmission admission,
  }) async* {
    final version = _creationGenerationVersion;
    final scope = _creationScopeKey(wsId);
    bool current() =>
        version == _creationGenerationVersion &&
        scope == _creationScopeKey(wsId) &&
        creation.isCurrent() &&
        admission.current;
    final user = messages.reversed.where((m) => m.role == 'user').firstOrNull;
    final requestId = user?.clientRequestId;
    if (!isUuid(chatId) ||
        requestId == null ||
        !isUuid(requestId) ||
        user?.replyToMessageId != null ||
        _latestUserText(messages).isEmpty) {
      throw const FormatException('Invalid first message identity');
    }
    final store = _creationStore(wsId, current);
    final AssistantResetEnvelope attempt;
    var creationAcknowledged = false;
    var creationStarted = false;
    try {
      admission.check();
      attempt = await store.beginCreation(requestId);
      creationStarted = true;
      admission.check();
      if (!current()) {
        throw const AssistantCreationUncertainException(
          'First message origin changed',
        );
      }
      yield const AssistantJsonStreamEvent({
        'type': 'native-dispatch-admitted',
      });
      final response = await _apiClient.sendJsonStreamAcknowledged(
        'POST',
        '/api/v1/workspaces/$wsId/chat/conversations/$chatId/messages',
        {
          'content': _latestUserText(messages),
          'kind': 'user',
          'clientRequestId': requestId,
          'miraMode': true,
          'timezone': timezone,
          'clientCapabilities': AssistantClientActions.chatCapabilities(),
          'initialConversation': creation.settings.toJson(),
        },
        accept: 'application/x-ndjson',
        admission: admission,
      );
      if (!current()) {
        await response.stream.listen((_) {}).cancel();
        store.hold();
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.stream.drain<void>();
        throw ApiException(
          message: 'First message was not acknowledged',
          statusCode: response.statusCode,
        );
      }
      final encoded = response.headers['x-mira-chat-creation'];
      late final AcknowledgedChatConversation acknowledged;
      try {
        if (encoded == null ||
            encoded.length > 4096 ||
            !(response.headers['content-type'] ?? '').contains(
              'application/x-ndjson',
            )) {
          throw const FormatException('Missing first message creation receipt');
        }
        final raw = jsonDecode(
          utf8.decode(base64Url.decode(base64Url.normalize(encoded))),
        );
        if (raw is! Map<String, dynamic> ||
            raw['creationRequestId'] != requestId ||
            raw['conversation'] is! Map<String, dynamic> ||
            (raw['conversation'] as Map)['creationRequestId'] != requestId) {
          throw const FormatException('Invalid first message creation key');
        }
        acknowledged = AcknowledgedChatConversation.fromResponse(
          raw,
          wsId: wsId,
          actorId: admission.actorId,
          initialSettings: creation.settings,
        );
        if (acknowledged.conversation.id != chatId) {
          throw const FormatException('First message chat identity changed');
        }
        await store.finishCreation(attempt, acknowledged: acknowledged);
        creationAcknowledged = true;
        admission.check();
        if (!current()) {
          throw const AssistantCreationUncertainException(
            'First message origin changed',
          );
        }
      } on Object {
        await response.stream.listen((_) {}).cancel();
        rethrow;
      }
      yield AssistantChatCreatedStreamEvent(
        AssistantCreatedChat(
          id: chatId,
          title: _titleFromPrompt(_latestUserText(messages)),
          model: creation.settings.modelId,
          createdAt: acknowledged.conversation.createdAt,
        ),
        requestId,
      );
      yield* _adaptNativeChatEvents(
        events: readChatMessageStream(response.stream, requireAssistant: true),
        chatId: chatId,
        wsId: wsId,
        messages: messages,
        attachments: const [],
        admission: admission,
        announceAdmission: false,
      );
    } on AssistantCreationSelectedException {
      rethrow;
    } on Object catch (error, stack) {
      if (!creationAcknowledged) store.hold();
      if (creationStarted && !current()) return;
      Error.throwWithStackTrace(admission.preparationFailure(error), stack);
    }
  }
}
