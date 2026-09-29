part of 'chat_repository.dart';

extension ChatRepositoryPanels on ChatRepository {
  Future<List<ChatLinkPreview>> getLinkPreviews(
    String wsId,
    String conversationId,
    List<String> urls,
  ) async {
    final response = await _apiClient.postJson(
      '${_conversationPath(wsId, conversationId)}/link-previews',
      {'urls': urls},
    );
    return (response['previews'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ChatLinkPreview.fromJson)
        .toList(growable: false);
  }

  Future<ChatSharedContent> getSharedContent(
    String wsId,
    String conversationId,
  ) async {
    final response = await _read(
      wsId,
      'sharedContent',
      '${_conversationPath(wsId, conversationId)}/shared-content',
    );
    return ChatSharedContent.fromJson(response);
  }

  Future<ChatAiSettings> getAiSettings(
    String wsId,
    String conversationId,
  ) async {
    final response = await _read(
      wsId,
      'aiSettings',
      '${_conversationPath(wsId, conversationId)}/ai-settings',
    );
    final path = '${_conversationPath(wsId, conversationId)}/ai-settings';
    final settings = <String, dynamic>{
      ...?response['settings'] as Map<String, dynamic>?,
      'conversation_id': conversationId,
    };
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature == 'chat' &&
          item.workspaceId == wsId &&
          item.path == path) {
        settings.addAll(item.payload ?? const {});
      }
    }
    return ChatAiSettings.fromJson(settings);
  }

  Future<ChatAiSettings> updateAiSettings(
    String wsId,
    String conversationId, {
    ChatAiCreditSource? creditSource,
    String? creditWsId,
    String? modelId,
    String? systemPrompt,
    ChatAiThinkingMode? thinkingMode,
  }) async {
    final path = '${_conversationPath(wsId, conversationId)}/ai-settings';
    final payload = <String, dynamic>{
      if (creditSource != null) 'creditSource': creditSource.name,
      if (creditWsId != null) 'creditWsId': creditWsId,
      if (modelId != null) 'modelId': modelId,
      if (systemPrompt != null) 'systemPrompt': systemPrompt,
      if (thinkingMode != null) 'thinkingMode': thinkingMode.name,
    };
    return await queueOrSendValue<ChatAiSettings>(
      feature: 'chat',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: conversationId,
      payload: payload,
      pendingValue: (_) => ChatAiSettings.fromJson({
        ...payload,
        'conversation_id': conversationId,
      }),
      send: () async => ChatAiSettings.fromJson(
        (await _apiClient.patchJson(path, payload))['settings']
                as Map<String, dynamic>? ??
            const <String, dynamic>{},
      ),
    );
  }

  Future<ChatAiObservability> getAiObservability(
    String wsId,
    String conversationId,
  ) async {
    final response = await _read(
      wsId,
      'aiObservability',
      '${_conversationPath(wsId, conversationId)}/ai-observability',
    );
    return ChatAiObservability.fromJson(response);
  }

  Future<List<ChatUserProfile>> searchDirectory(
    String wsId,
    String query,
  ) async {
    final encoded = Uri(queryParameters: {'q': query}).query;
    final response = await _read(
      wsId,
      'directory',
      '/api/v1/workspaces/$wsId/chat/directory?$encoded',
    );
    return (response['users'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ChatUserProfile.fromJson)
        .toList(growable: false);
  }

  Future<List<ChatMessage>> searchMessages(String wsId, String query) async {
    final encoded = Uri(queryParameters: {'q': query}).query;
    final response = await _read(
      wsId,
      'search',
      '/api/v1/workspaces/$wsId/chat/search?$encoded',
    );
    return (response['messages'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ChatMessage.fromJson)
        .toList(growable: false);
  }

  Future<ChatFriendRequests> listFriendRequests(String wsId) async {
    final path = '/api/v1/workspaces/$wsId/chat/friend-requests';
    final response = await _read(wsId, 'friendRequests', path);
    final rows = <String, Map<String, dynamic>>{};
    final groups = <String, String>{};
    for (final group in ['accepted', 'incoming', 'outgoing']) {
      for (final row
          in (response[group] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>()) {
        final id = row['id'] as String?;
        if (id != null) {
          rows[id] = {...row};
          groups[id] = group;
        }
      }
    }
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature != 'chat' ||
          item.workspaceId != wsId ||
          (item.path != path && !item.path.startsWith('$path/'))) {
        continue;
      }
      final id = item.entityId;
      if (id == null) continue;
      if (item.method == 'DELETE') {
        rows.remove(id);
        groups.remove(id);
        continue;
      }
      rows[id] = {
        ...?rows[id],
        ...?item.payload,
        'id': id,
        if (item.method == 'POST')
          'recipient': {'display_name': item.payload?['email']},
      };
      groups[id] = item.method == 'POST'
          ? 'outgoing'
          : item.payload?['status'] == 'accepted'
          ? 'accepted'
          : item.payload?['status'] == 'declined'
          ? 'declined'
          : groups[id] ?? 'incoming';
    }
    return ChatFriendRequests.fromJson({
      for (final group in ['accepted', 'incoming', 'outgoing'])
        group: [
          for (final id in rows.keys)
            if (groups[id] == group) rows[id],
        ],
    });
  }

  Future<ChatFriendRequest> createFriendRequest(
    String wsId, {
    required String email,
  }) async {
    final path = '/api/v1/workspaces/$wsId/chat/friend-requests';
    final payload = {'email': email};
    return await queueOrSendValue<ChatFriendRequest>(
      feature: 'chat',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => ChatFriendRequest.fromJson({
        'id': id,
        'status': 'pending',
        'recipient': {'display_name': email},
      }),
      send: () async => ChatFriendRequest.fromJson(
        (await _apiClient.postJson(path, payload))['request']
                as Map<String, dynamic>? ??
            const <String, dynamic>{},
      ),
    );
  }

  Future<ChatFriendRequest> respondFriendRequest(
    String wsId,
    String requestId, {
    required ChatFriendRequestStatus status,
  }) async {
    final path = '/api/v1/workspaces/$wsId/chat/friend-requests/$requestId';
    final payload = {'status': status.name};
    return await queueOrSendValue<ChatFriendRequest>(
      feature: 'chat',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: requestId,
      payload: payload,
      pendingValue: (_) =>
          ChatFriendRequest.fromJson({'id': requestId, 'status': status.name}),
      send: () async => ChatFriendRequest.fromJson(
        (await _apiClient.patchJson(path, payload))['request']
                as Map<String, dynamic>? ??
            const <String, dynamic>{},
      ),
    );
  }

  Future<void> revokeFriendRequest(String wsId, String requestId) async {
    final path = '/api/v1/workspaces/$wsId/chat/friend-requests/$requestId';
    await queueOrSendVoid(
      feature: 'chat',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: requestId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
  }
}
