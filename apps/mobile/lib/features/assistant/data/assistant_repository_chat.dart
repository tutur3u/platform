part of 'assistant_repository.dart';

mixin _AssistantChatRepository {
  ApiClient get _apiClient;
  ChatRepository get _chatRepository;
  String generateUuid();
  String? Function() get _currentUserId;
  CacheStore get _chatCacheStore;
  AssistantChatCacheOrigin? captureChatCacheOrigin({
    required String wsId,
    required String chatId,
    required bool Function() isCurrent,
  });
  Future<AssistantChatCachePublication> publishAssistantChatSnapshot({
    required AssistantChatCacheOrigin origin,
    required AssistantRestoredChat restored,
  });
  void _trackChatCache(Future<void> operation);
  AssistantChatCachePublication _cacheFailure(
    AssistantChatCacheOrigin origin,
    Object error,
  );

  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async {
    if (chatId.startsWith('ai-agent-thread-')) return null;
    final route = AssistantChatRoute.parse(chatId);
    final origin =
        cacheOrigin ??
        captureChatCacheOrigin(
          wsId: wsId,
          chatId: chatId,
          isCurrent: () => true,
        );
    origin?.checkScope();

    if (!forceRefresh && origin != null) {
      final cached = await _chatCacheStore.read<AssistantRestoredChat>(
        key: origin.key,
        decode: AssistantRepository._decodeRestoredCache,
      );
      origin.checkScope();
      if (cached.hasValue && cached.data != null && !cached.isExpired) {
        _trackChatCache(
          restoreChat(
            wsId: wsId,
            chatId: chatId,
            forceRefresh: true,
            cacheOrigin: origin,
          ).then<void>(
            (_) {},
            onError: (Object error, StackTrace stack) {
              _cacheFailure(origin, error);
            },
          ),
        );
        return cached.data;
      }
    }

    final nativeRestored = await _restoreNativeChat(
      wsId: wsId,
      chatId: chatId,
      cacheOrigin: origin,
    );
    origin?.checkScope();
    if (nativeRestored != null) {
      if (origin != null) {
        await publishAssistantChatSnapshot(
          origin: origin,
          restored: nativeRestored,
        );
        origin.checkScope();
      }
      return nativeRestored;
    }

    late final Map<String, dynamic> payload;
    try {
      payload = await _apiClient.postJson('/api/ai/chat/restore', {
        'chatId': route.storageId,
      });
      origin?.checkScope();
    } on ApiException catch (error) {
      origin?.checkScope();
      if (error.statusCode == 404) return null;
      rethrow;
    }

    final chatRaw = payload['chat'];
    if (chatRaw is! Map<String, dynamic> || chatRaw['id'] != route.storageId) {
      throw const FormatException('Invalid assistant chat receipt');
    }

    final messagesRaw = payload['messages'];
    if (messagesRaw is! List ||
        messagesRaw.any(
          (row) =>
              row is! Map<String, dynamic> ||
              row['id'] is! String ||
              !isUuid(row['id'] as String),
        )) {
      throw const FormatException('Invalid assistant history receipt');
    }
    final messageRows = messagesRaw.whereType<Map<String, dynamic>>().toList();

    final messages = _restoreMessages(messageRows);

    final attachmentResponse = await _apiClient.postJson(
      '/api/ai/chat/file-urls',
      {'wsId': wsId, 'chatId': route.storageId},
    );

    origin?.checkScope();
    final attachmentsByMessageId = <String, List<AssistantAttachment>>{};
    final files = (attachmentResponse['files'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();

    final firstUserMessageId = messages
        .firstWhere(
          (message) => message.role == 'user',
          orElse: () => const AssistantMessage(id: '', role: 'user'),
        )
        .id;

    for (var index = 0; index < files.length; index++) {
      final file = files[index];
      String? targetMessageId;

      for (final raw in messageRows) {
        final metadata = raw['metadata'];
        if (metadata is! Map<String, dynamic>) {
          continue;
        }
        final attachments = metadata['attachments'];
        if (attachments is! List<dynamic>) {
          continue;
        }
        final hasMatch = attachments.whereType<Map<String, dynamic>>().any((
          attachment,
        ) {
          final storagePath = attachment['storagePath'];
          final url = attachment['url'];
          final id = attachment['id'];
          return storagePath == file['path'] ||
              url == file['path'] ||
              id == file['path'];
        });
        if (hasMatch) {
          targetMessageId = raw['id'] as String?;
          break;
        }
      }

      targetMessageId ??= firstUserMessageId.isEmpty
          ? null
          : firstUserMessageId;
      if (targetMessageId == null) {
        continue;
      }

      attachmentsByMessageId.putIfAbsent(targetMessageId, () => []);
      attachmentsByMessageId[targetMessageId]!.add(
        AssistantAttachment.fromStoredFile(file),
      );
    }

    final restored = AssistantRestoredChat(
      chat: AssistantChatRecord.fromJson({
        ...chatRaw,
        'id': route.conversationId,
      }),
      messages: messages,
      attachmentsByMessageId: attachmentsByMessageId,
    );

    if (origin != null) {
      await publishAssistantChatSnapshot(origin: origin, restored: restored);
      origin.checkScope();
    }

    return restored;
  }

  Future<AssistantChatRecord> _createChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
    required bool Function() isCurrentCreation,
  }) async {
    final key = _creationScopeKey(wsId);
    bool current() => key == _creationScopeKey(wsId) && isCurrentCreation();
    final store = _creationStore(wsId, current);
    final AssistantResetEnvelope attempt;
    try {
      attempt = await store.beginCreation(id);
    } on AssistantCreationSelectedException {
      rethrow;
    } on Object {
      store.hold();
      throw const AssistantCreationUncertainException(
        'Assistant creation hold could not be confirmed',
      );
    }
    if (!current()) {
      store.hold();
      throw const AssistantCreationUncertainException(
        'Assistant creation origin changed before transport',
      );
    }
    final acknowledged = await _createAcknowledgedConversation(
      wsId,
      message,
      modelId,
      store,
      attempt,
    );
    if (!current()) {
      store.hold();
      throw const AssistantCreationUncertainException(
        'Assistant creation generation changed',
      );
    }
    try {
      await store.finishCreation(attempt, acknowledged: acknowledged);
    } on Object {
      store.hold();
      throw const AssistantCreationUncertainException(
        'Assistant durable creation receipt could not be retained',
      );
    }
    return _assistantChatRecordFromConversation(
      acknowledged.conversation,
      modelId: modelId,
    );
  }

  Stream<AssistantStreamEvent> streamChat({
    required String chatId,
    required String wsId,
    required String? workspaceContextId,
    required String modelId,
    required List<AssistantMessage> messages,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String timezone,
    List<AssistantAttachment> attachments = const [],
    String? creditWsId,
  }) async* {
    final route = AssistantChatRoute.parse(chatId);
    if (route.kind == AssistantChatRouteKind.legacy) {
      yield* _streamLegacyChat(
        chatId: route.storageId,
        wsId: wsId,
        workspaceContextId: workspaceContextId,
        modelId: modelId,
        messages: messages,
        thinkingMode: thinkingMode,
        creditSource: creditSource,
        timezone: timezone,
        creditWsId: creditWsId,
      );
      return;
    }
    final settings = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/chat/conversations/$chatId/ai-settings',
    );
    requireAssistantSendSettings(
      settings,
      chatId: chatId,
      modelId: modelId,
      creditSource: creditSource.name,
      creditWsId: creditWsId,
      thinkingMode: thinkingMode.name,
    );
    {
      var assistantStarted = false;
      final nativeAttachments = _chatAttachmentDrafts(chatId, attachments);
      final requestId =
          messages.reversed
              .where((message) => message.role == 'user')
              .firstOrNull
              ?.clientRequestId ??
          messages.reversed
              .where((message) => message.role == 'user')
              .firstOrNull
              ?.id;
      AssistantJsonStreamEvent userReceipt(ChatMessage saved) {
        requireAssistantMessageReceipts([saved], conversationId: chatId);
        final original = assistantClientRequestId(saved.metadata);
        if (requestId == null ||
            original != requestId ||
            saved.content != _latestUserText(messages)) {
          throw const FormatException(
            'Assistant user receipt differs from submitted request',
          );
        }
        return AssistantJsonStreamEvent({
          'type': 'saved-user-message',
          'messageId': saved.id,
          'clientRequestId': original,
          'text': saved.content,
        });
      }

      await for (final event in _chatRepository.sendMessageStream(
        wsId,
        chatId,
        content: _latestUserText(messages),
        attachments: nativeAttachments,
        clientRequestId: requestId,
        miraMode: true,
      )) {
        if (event is ChatStreamMessageEvent &&
            event.message.kind == ChatMessageKind.user) {
          yield userReceipt(event.message);
          continue;
        }
        if (event is ChatStreamAssistantDeltaEvent) {
          if (!assistantStarted) {
            assistantStarted = true;
            yield AssistantJsonStreamEvent({
              'type': 'start',
              'messageId': generateUuid(),
            });
          }
          yield AssistantJsonStreamEvent({
            'type': 'text-delta',
            'delta': event.delta,
          });
          continue;
        }

        if (event is ChatStreamAssistantPartEvent) {
          if (!assistantStarted) {
            assistantStarted = true;
            yield AssistantJsonStreamEvent({
              'type': 'start',
              'messageId': generateUuid(),
            });
          }
          yield _assistantEventFromChatPart(event.part);
          continue;
        }
        if (event is ChatStreamMessagesEvent) {
          requireAssistantMessageReceipts(
            event.messages,
            conversationId: chatId,
          );
          for (final user in event.messages.where(
            (message) => message.kind == ChatMessageKind.user,
          )) {
            yield userReceipt(user);
          }
          final assistantMessages = event.messages.where(
            (message) => message.kind == ChatMessageKind.assistant,
          );
          for (final message in assistantMessages) {
            if (!assistantStarted) {
              yield AssistantJsonStreamEvent({
                'type': 'start',
                'messageId': message.id,
              });
              assistantStarted = true;
            }
            yield AssistantJsonStreamEvent({
              'type': 'saved-message',
              'messageId': message.id,
              'text': message.content,
            });
          }
          continue;
        }

        if (event is ChatStreamErrorEvent) {
          yield AssistantJsonStreamEvent({
            'type': 'error',
            'errorText': event.message,
          });
          continue;
        }

        if (event is ChatStreamDoneEvent) {
          yield const AssistantDoneStreamEvent();
        }
      }
      return;
    }
  }

  Stream<AssistantStreamEvent> _streamLegacyChat({
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
    final response = await _apiClient.sendJsonStream('POST', '/api/ai/chat', {
      'id': chatId,
      'wsId': wsId,
      'workspaceContextId': workspaceContextId,
      'model': modelId,
      'messages': messages.map((message) => message.toJson()).toList(),
      'isMiraMode': true,
      'timezone': timezone,
      'thinkingMode': AssistantThinkingMode.thinking.name,
      'creditSource': creditSource.name,
      if (creditWsId != null) 'creditWsId': creditWsId,
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
      final events = parser.addChunk(chunk);
      for (final event in events) {
        yield event;
      }
    }

    for (final event in parser.close()) {
      yield event;
    }
  }

  Future<AssistantRestoredChat?> _restoreNativeChat({
    required String wsId,
    required String chatId,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async {
    cacheOrigin?.checkScope();
    final route = AssistantChatRoute.parse(chatId);
    try {
      if (route.kind == AssistantChatRouteKind.native) {
        final payload = await _apiClient.getJson(
          '/api/v1/workspaces/$wsId/chat/conversations/$chatId/ai-settings',
        );
        cacheOrigin?.checkScope();
        requireAssistantSettingsReceipt(payload, chatId: chatId);
      }
      final messages = await _chatRepository.listMessages(wsId, chatId);
      cacheOrigin?.checkScope();
      requireAssistantMessageReceipts(messages, conversationId: chatId);
      return AssistantRestoredChat(
        chat: AssistantChatRecord(id: chatId),
        messages: messages.map(_assistantMessageFromChatMessage).toList(),
        attachmentsByMessageId: _assistantAttachmentsFromChatMessages(messages),
      );
    } on ApiException catch (error) {
      cacheOrigin?.checkScope();
      if (route.kind == AssistantChatRouteKind.legacy &&
          error.statusCode == 404) {
        return null;
      }
      rethrow;
    }
  }

  AssistantChatRecord _assistantChatRecordFromConversation(
    ChatConversation conversation, {
    String? modelId,
  }) {
    return AssistantChatRecord(
      id: conversation.id,
      title: conversation.title,
      model: modelId ?? conversation.metadata['modelId']?.toString(),
      createdAt: conversation.createdAt,
    );
  }

  AssistantMessage _assistantMessageFromChatMessage(ChatMessage message) =>
      restoreAssistantChatMessage(message);

  Map<String, List<AssistantAttachment>> _assistantAttachmentsFromChatMessages(
    List<ChatMessage> messages,
  ) {
    final out = <String, List<AssistantAttachment>>{};
    for (final message in messages) {
      if (message.attachments.isEmpty) continue;
      out[message.id] = message.attachments
          .map(_assistantAttachmentFromChatAttachment)
          .toList(growable: false);
    }
    return out;
  }

  AssistantAttachment _assistantAttachmentFromChatAttachment(
    ChatAttachment attachment, {
    String? fallbackId,
    String? fallbackPath,
    String? fallbackType,
    int? fallbackSize,
  }) {
    return AssistantAttachment(
      id: fallbackId ?? attachment.id,
      name: attachment.filename,
      size: attachment.sizeBytes ?? fallbackSize ?? 0,
      type:
          attachment.contentType ?? fallbackType ?? 'application/octet-stream',
      localPath: fallbackPath,
      storagePath: attachment.storagePath,
      uploadState: AssistantAttachmentUploadState.uploaded,
    );
  }

  List<ChatAttachmentDraft> _chatAttachmentDrafts(
    String conversationId,
    List<AssistantAttachment> attachments,
  ) {
    return attachments
        .where((attachment) {
          final path = attachment.storagePath;
          return path != null && path.startsWith('chats/$conversationId/');
        })
        .map(
          (attachment) => ChatAttachmentDraft(
            filename: attachment.name,
            path: attachment.storagePath!,
            contentType: attachment.type,
            sizeBytes: attachment.size,
          ),
        )
        .toList(growable: false);
  }

  AssistantJsonStreamEvent _assistantEventFromChatPart(
    Map<String, dynamic> part,
  ) {
    if (part['type'] == 'reasoning') {
      return AssistantJsonStreamEvent({
        'type': 'reasoning-delta',
        'delta': part['text']?.toString() ?? '',
      });
    }
    return AssistantJsonStreamEvent(part);
  }

  String _latestUserText(List<AssistantMessage> messages) {
    for (final message in messages.reversed) {
      if (message.role != 'user') continue;
      final text = message.parts
          .where((part) => part.type == 'text')
          .map((part) => part.text ?? '')
          .join('\n\n')
          .trim();
      if (text.isNotEmpty) return text;
    }
    return '';
  }

  String _titleFromPrompt(String message) {
    final compact = message.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (compact.isEmpty) return 'Assistant chat';
    if (compact.length <= 64) return compact;
    return '${compact.substring(0, 61)}...';
  }

  List<AssistantMessage> _restoreMessages(
    List<Map<String, dynamic>> messagesData,
  ) {
    return messagesData
        .where((message) {
          final metadata = message['metadata'] as Map<String, dynamic>?;
          return message['content'] != null ||
              metadata?['parts'] != null ||
              metadata?['toolCalls'] != null ||
              metadata?['reasoning'] != null ||
              metadata?['sources'] != null;
        })
        .map((message) {
          final parts = restoreAssistantHistoryParts(
            message['content'] as String?,
            message['metadata'] as Map<String, dynamic>?,
          );
          return AssistantMessage(
            id: message['id'] as String,
            role: _normalizeRole(message['role'] as String?),
            liveTurnId: (message['metadata'] as Map?)?['liveTurnId'] as String?,
            parts: parts,
            createdAt: DateTime.tryParse(
              message['created_at'] as String? ?? '',
            ),
          );
        })
        .toList();
  }

  String _normalizeRole(String? role) {
    if (role == null) return 'assistant';
    return role.toLowerCase() == 'user' ? 'user' : 'assistant';
  }

  String _creationScopeKey(String wsId) {
    final actor = _currentUserId();
    if (actor == null || !isUuid(actor) || !isUuid(wsId)) {
      throw const AssistantCreationUncertainException(
        'Assistant creation scope is unavailable',
      );
    }
    return '$actor::mira-chat-creation::$wsId';
  }

  AssistantResetPreferences _creationStore(
    String wsId, [
    bool Function()? current,
  ]) {
    final actor = _creationScopeKey(wsId).split('::').first;
    final store = AssistantResetPreferences(
      actorId: actor,
      workspaceId: wsId,
      isCurrent: () => _currentUserId() == actor && (current?.call() ?? true),
    );
    if (this is AssistantRepository) {
      (this as AssistantRepository)._creationEnvelopeKeys.add(store.key);
    }
    return store;
  }

  Future<bool> hasUnknownChatCreation(String wsId) async {
    final store = _creationStore(wsId);
    try {
      return await store.hasUnknownCreation();
    } on Object {
      store.hold();
      throw const AssistantCreationUncertainException(
        'Assistant creation scope is unreadable',
      );
    }
  }

  /// Legacy clearing cannot grant creation authority. Only a current process
  /// receipt from the complete informed reset protocol can do so.
  Future<void> acknowledgeUnknownChatCreation(String wsId) async {
    throw const AssistantCreationUncertainException(
      'Assistant creation requires an informed reset receipt',
    );
  }

  Future<AcknowledgedChatConversation> _createAcknowledgedConversation(
    String wsId,
    String message,
    String modelId,
    AssistantResetPreferences store,
    AssistantResetEnvelope attempt,
  ) async {
    try {
      return await _chatRepository.createAcknowledgedConversation(
        wsId,
        title: _titleFromPrompt(message),
        modelId: modelId,
      );
    } on ApiException catch (error) {
      if (error.statusCode == 400 &&
          error.code == 'chat_create_invalid_request') {
        await store.finishCreation(attempt, denial: error);
      }
      rethrow;
    }
  }
}
