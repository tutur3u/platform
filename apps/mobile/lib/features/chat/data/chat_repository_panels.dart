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
    final response = await _apiClient.getJson(
      '${_conversationPath(wsId, conversationId)}/shared-content',
    );
    return ChatSharedContent.fromJson(response);
  }

  Future<ChatAiSettings> getAiSettings(
    String wsId,
    String conversationId,
  ) async {
    final response = await _apiClient.getJson(
      '${_conversationPath(wsId, conversationId)}/ai-settings',
    );
    return ChatAiSettings.fromJson(
      response['settings'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );
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
    final response = await _apiClient.patchJson(
      '${_conversationPath(wsId, conversationId)}/ai-settings',
      {
        if (creditSource != null) 'creditSource': creditSource.name,
        if (creditWsId != null) 'creditWsId': creditWsId,
        if (modelId != null) 'modelId': modelId,
        if (systemPrompt != null) 'systemPrompt': systemPrompt,
        if (thinkingMode != null) 'thinkingMode': thinkingMode.name,
      },
    );
    return ChatAiSettings.fromJson(
      response['settings'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );
  }

  Future<ChatAiObservability> getAiObservability(
    String wsId,
    String conversationId,
  ) async {
    final response = await _apiClient.getJson(
      '${_conversationPath(wsId, conversationId)}/ai-observability',
    );
    return ChatAiObservability.fromJson(response);
  }

  Future<List<ChatUserProfile>> searchDirectory(
    String wsId,
    String query,
  ) async {
    final encoded = Uri(queryParameters: {'q': query}).query;
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/chat/directory?$encoded',
    );
    return (response['users'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ChatUserProfile.fromJson)
        .toList(growable: false);
  }

  Future<List<ChatMessage>> searchMessages(String wsId, String query) async {
    final encoded = Uri(queryParameters: {'q': query}).query;
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/chat/search?$encoded',
    );
    return (response['messages'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ChatMessage.fromJson)
        .toList(growable: false);
  }

  Future<ChatFriendRequests> listFriendRequests(String wsId) async {
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/chat/friend-requests',
    );
    return ChatFriendRequests.fromJson(response);
  }

  Future<ChatFriendRequest> createFriendRequest(
    String wsId, {
    required String email,
  }) async {
    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/chat/friend-requests',
      {'email': email},
    );
    return ChatFriendRequest.fromJson(
      response['request'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<ChatFriendRequest> respondFriendRequest(
    String wsId,
    String requestId, {
    required ChatFriendRequestStatus status,
  }) async {
    final response = await _apiClient.patchJson(
      '/api/v1/workspaces/$wsId/chat/friend-requests/$requestId',
      {'status': status.name},
    );
    return ChatFriendRequest.fromJson(
      response['request'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<void> revokeFriendRequest(String wsId, String requestId) async {
    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/chat/friend-requests/$requestId',
    );
  }
}
