import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

part 'chat_repository_panels.dart';

class ChatRepository {
  ChatRepository({
    ApiClient? apiClient,
    http.Client? httpClient,
    bool ownsApiClient = false,
  }) : _apiClient = apiClient ?? ApiClient(),
       _httpClient = httpClient ?? http.Client(),
       _ownsApiClient = ownsApiClient || apiClient == null;

  final ApiClient _apiClient;
  final http.Client _httpClient;
  final bool _ownsApiClient;

  Future<Map<String, dynamic>> _read(
    String wsId,
    String namespace,
    String path,
  ) => readThroughJson(
    api: _apiClient,
    namespace: 'chat.$namespace',
    workspaceId: wsId,
    path: path,
  );

  Future<ChatConversationPage> listConversations(
    String wsId, {
    ChatArchivedFilter archived = ChatArchivedFilter.active,
    int limit = 40,
    int offset = 0,
  }) async {
    final query = Uri(
      queryParameters: {
        'archived': archived.name,
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
    ).query;
    final base = '/api/v1/workspaces/$wsId/chat/conversations';
    final response = await _read(wsId, 'conversations', '$base?$query');
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'chat',
      pathContains: base,
      source: (response['conversations'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .toList(growable: false),
      pending: (await OfflineMutationQueue.instance.listPending())
          .where(
            (item) =>
                item.path == base || item.path == '$base/${item.entityId}',
          )
          .toList(growable: false),
      normalizeCreate: (payload) => {
        ...payload,
        'ws_id': wsId,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      includeCreates: offset == 0 && archived != ChatArchivedFilter.archived,
    );
    return ChatConversationPage.fromJson({...response, 'conversations': rows});
  }

  Future<ChatConversation> createConversation(
    String wsId, {
    required ChatConversationType type,
    String? title,
    String? description,
    List<String> participantUserIds = const [],
    bool? aiEnabled,
    bool? autoReply,
    String? modelId,
    String? systemPrompt,
  }) async {
    final path = '/api/v1/workspaces/$wsId/chat/conversations';
    final payload = <String, dynamic>{
      'type': type.name,
      if (title != null) 'title': title,
      if (description != null) 'description': description,
      if (participantUserIds.isNotEmpty)
        'participantUserIds': participantUserIds,
      if (aiEnabled != null) 'aiEnabled': aiEnabled,
      if (autoReply != null) 'autoReply': autoReply,
      if (modelId != null) 'modelId': modelId,
      if (systemPrompt != null) 'systemPrompt': systemPrompt,
    };
    return await queueOrSendValue(
      feature: 'chat',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      send: () async {
        final response = await _apiClient.postJson(path, payload);
        return ChatConversation.fromJson(
          response['conversation'] as Map<String, dynamic>? ?? const {},
        );
      },
      pendingValue: (id) => ChatConversation.fromJson({
        ...payload,
        'id': id,
        'ws_id': wsId,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }),
    );
  }

  Future<ChatConversation> updateConversation(
    String wsId,
    String conversationId, {
    String? title,
    String? description,
    bool? pinned,
  }) async {
    final path = _conversationPath(wsId, conversationId);
    final payload = <String, dynamic>{
      if (title != null) 'title': title,
      if (description != null) 'description': description,
      if (pinned != null) 'pinned': pinned,
    };
    return await queueOrSendValue(
      feature: 'chat',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: conversationId,
      payload: payload,
      send: () async {
        final response = await _apiClient.patchJson(path, payload);
        return ChatConversation.fromJson(
          response['conversation'] as Map<String, dynamic>? ?? const {},
        );
      },
      pendingValue: (id) => ChatConversation.fromJson({
        ...payload,
        'id': id,
        'ws_id': wsId,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }),
    );
  }

  Future<void> deleteConversation(String wsId, String conversationId) async {
    final path = _conversationPath(wsId, conversationId);
    await queueOrSendVoid(
      feature: 'chat',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: conversationId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
  }

  Future<List<ChatMessage>> listMessages(
    String wsId,
    String conversationId, {
    String? before,
    int limit = 60,
  }) async {
    final query = Uri(
      queryParameters: {
        'limit': limit.toString(),
        if (before != null) 'before': before,
      },
    ).query;
    final path = '${_conversationPath(wsId, conversationId)}/messages';
    final response = await _read(wsId, 'messages', '$path?$query');
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'chat',
      pathContains: path,
      source: (response['messages'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .toList(growable: false),
      pending: (await OfflineMutationQueue.instance.listPending())
          .where((item) => item.path == path || item.path.startsWith('$path/'))
          .toList(growable: false),
      normalizeCreate: (payload) => {
        ...payload,
        'conversation_id': conversationId,
        'created_at': DateTime.now().toUtc().toIso8601String(),
      },
      includeCreates: before == null,
    );
    return rows.map(ChatMessage.fromJson).toList(growable: false);
  }

  Future<String> attachmentReadUrl(
    String wsId,
    String conversationId,
    String attachmentId,
  ) async {
    final response = await _apiClient.getJson(
      '${_conversationPath(wsId, conversationId)}/attachments/$attachmentId',
    );
    final url = response['signedUrl'] as String?;
    if (url == null || url.isEmpty) {
      throw const ApiException(
        message: 'Attachment preview unavailable',
        statusCode: 0,
      );
    }
    return url;
  }

  Stream<ChatMessageStreamEvent> sendMessageStream(
    String wsId,
    String conversationId, {
    required String content,
    ChatMessageKind kind = ChatMessageKind.user,
    List<ChatAttachmentDraft> attachments = const [],
    String? replyToMessageId,
    String? clientRequestId,
    bool miraMode = false,
  }) async* {
    final path = '${_conversationPath(wsId, conversationId)}/messages';
    final requestId = clientRequestId ?? newLocalMutationId();
    final localId = newLocalMutationId();
    final payload = <String, dynamic>{
      'content': content,
      'kind': kind.name,
      'attachments': attachments
          .map((attachment) => attachment.toJson())
          .toList(growable: false),
      if (replyToMessageId != null) 'replyToMessageId': replyToMessageId,
      'clientRequestId': requestId,
      if (miraMode) 'miraMode': true,
    };
    ChatMessage pendingMessage() => ChatMessage.fromJson({
      ...payload,
      'id': localId,
      'conversation_id': conversationId,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    });
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'chat',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: localId,
      replaySafe: kind == ChatMessageKind.user && !miraMode,
    )) {
      yield ChatStreamMessageEvent(pendingMessage());
      yield const ChatStreamDoneEvent();
      return;
    }
    late final http.StreamedResponse response;
    try {
      response = await _apiClient.sendJsonStream(
        'POST',
        path,
        payload,
        accept: 'application/x-ndjson',
      );
    } on ApiException catch (error) {
      if (!await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
        error: error,
        feature: 'chat',
        method: 'POST',
        path: path,
        workspaceId: wsId,
        payload: payload,
        entityId: localId,
        replaySafe: kind == ChatMessageKind.user && !miraMode,
      )) {
        rethrow;
      }
      yield ChatStreamMessageEvent(pendingMessage());
      yield const ChatStreamDoneEvent();
      return;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final body = await response.stream.bytesToString();
      throw ApiException(
        message: _errorFromBody(body, 'Failed to send chat message'),
        statusCode: response.statusCode,
      );
    }

    final contentType = response.headers['content-type'] ?? '';
    if (!contentType.contains('application/x-ndjson')) {
      final body = await response.stream.bytesToString();
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) {
        final message = decoded['message'];
        if (message is Map<String, dynamic>) {
          yield ChatStreamMessageEvent(ChatMessage.fromJson(message));
        }
        final messages = decoded['messages'];
        if (messages is List) {
          yield ChatStreamMessagesEvent(
            messages
                .whereType<Map<String, dynamic>>()
                .map(ChatMessage.fromJson)
                .toList(growable: false),
          );
        }
      }
      yield const ChatStreamDoneEvent();
      return;
    }

    final parser = ChatNdjsonStreamParser();
    await for (final chunk in response.stream) {
      for (final event in parser.addChunk(chunk)) {
        yield event;
      }
    }
    for (final event in parser.close()) {
      yield event;
    }
  }

  Future<ChatMessage> editMessage(
    String wsId,
    String conversationId,
    String messageId, {
    required String content,
  }) async {
    final response = await _apiClient.patchJson(
      '${_conversationPath(wsId, conversationId)}/messages/$messageId',
      {'content': content},
    );
    return ChatMessage.fromJson(
      response['message'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<ChatMessage> deleteMessage(
    String wsId,
    String conversationId,
    String messageId,
  ) async {
    final response = await _apiClient.deleteJson(
      '${_conversationPath(wsId, conversationId)}/messages/$messageId',
    );
    return ChatMessage.fromJson(
      response['message'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<ChatConversation> markRead(
    String wsId,
    String conversationId, {
    String? messageId,
  }) async {
    final response = await _apiClient.postJson(
      '${_conversationPath(wsId, conversationId)}/read',
      {if (messageId != null) 'messageId': messageId},
    );
    return ChatConversation.fromJson(
      response['conversation'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );
  }

  Future<ChatMessage> toggleReaction(
    String wsId,
    String conversationId, {
    required String messageId,
    required String emoji,
  }) async {
    final response = await _apiClient.postJson(
      '${_conversationPath(wsId, conversationId)}/reactions',
      {'messageId': messageId, 'emoji': emoji},
    );
    return ChatMessage.fromJson(
      response['message'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<ChatAttachment> uploadAttachment(
    String wsId,
    String conversationId, {
    required PlatformFile file,
  }) async {
    final sizeBytes = await file.length();
    final contentType = file.name.toLowerCase().endsWith('.m4a')
        ? 'audio/mp4'
        : lookupMimeType(file.name) ?? 'application/octet-stream';

    final uploadPayload = await _apiClient.postJson(
      '${_conversationPath(wsId, conversationId)}/attachments/upload-url',
      {
        'filename': file.name,
        'contentType': contentType,
        'sizeBytes': sizeBytes,
      },
    );

    final signedUrl = uploadPayload['signedUrl'] as String?;
    if (signedUrl == null || signedUrl.isEmpty) {
      throw const ApiException(
        message: 'Failed to prepare upload',
        statusCode: 0,
      );
    }

    final headers =
        (uploadPayload['headers'] as Map<dynamic, dynamic>? ??
                const <dynamic, dynamic>{})
            .map((key, value) => MapEntry(key.toString(), value.toString()));
    final token = uploadPayload['token'] as String?;
    final uploadHeaders = <String, String>{
      ...headers,
      'Content-Type': contentType,
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };

    var uploadResponse = await _uploadSignedFile(
      file: file,
      headers: uploadHeaders,
      sizeBytes: sizeBytes,
      url: signedUrl,
    );

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      final fallbackHeaders = <String, String>{...uploadHeaders}
        ..remove('Content-Type');
      uploadResponse = await _uploadSignedFile(
        file: file,
        headers: fallbackHeaders,
        sizeBytes: sizeBytes,
        url: signedUrl,
      );
    }

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      throw ApiException(
        message: 'Failed to upload attachment',
        statusCode: uploadResponse.statusCode,
      );
    }

    return ChatAttachment.fromJson(
      uploadPayload['attachment'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );
  }

  Future<http.StreamedResponse> _uploadSignedFile({
    required PlatformFile file,
    required Map<String, String> headers,
    required int sizeBytes,
    required String url,
  }) async {
    final request = http.StreamedRequest('PUT', Uri.parse(url))
      ..contentLength = sizeBytes
      ..headers.addAll(headers);
    final response = _httpClient.send(request);
    await request.sink.addStream(file.readAsByteStream());
    await request.sink.close();
    return await response;
  }

  String _conversationPath(String wsId, String conversationId) {
    return '/api/v1/workspaces/$wsId/chat/conversations/$conversationId';
  }

  String _errorFromBody(String body, String fallback) {
    if (body.isEmpty) return fallback;
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) {
        return decoded['message']?.toString() ??
            decoded['error']?.toString() ??
            fallback;
      }
    } on FormatException {
      return body;
    }
    return body;
  }

  void dispose() {
    if (_ownsApiClient) {
      _apiClient.dispose();
    }
    _httpClient.close();
  }
}
