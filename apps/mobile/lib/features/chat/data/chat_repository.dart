import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/chat_attachment_delivery.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_stream_completion.dart';
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
    final pendingUploads = await OfflineMutationQueue.instance.listPending();
    if (attachments.any(
      (attachment) => pendingUploads.any(
        (record) =>
            record.feature == 'chat' &&
            record.method == 'CHAT_UPLOAD' &&
            record.entityId == attachment.path,
      ),
    )) {
      await OfflineMutationQueue.instance.enqueue(
        PendingMutationRecord(
          id: newLocalMutationId(),
          feature: 'chat',
          method: 'POST',
          path: path,
          createdAt: DateTime.now().toUtc(),
          userId: currentCacheUserId(),
          workspaceId: wsId,
          payload: payload,
          optimisticPatch: {'entityId': localId},
          replaySafe: kind == ChatMessageKind.user && !miraMode,
        ),
      );
      yield ChatStreamMessageEvent(pendingMessage());
      yield const ChatStreamDoneEvent();
      return;
    }
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

    yield* readChatMessageStream(response.stream, requireAssistant: miraMode);
  }

  Future<ChatMessage> editMessage(
    String wsId,
    String conversationId,
    String messageId, {
    required String content,
  }) async {
    final path =
        '${_conversationPath(wsId, conversationId)}/messages/$messageId';
    final payload = {'content': content};
    return await queueOrSendValue<ChatMessage>(
      feature: 'chat',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: messageId,
      payload: payload,
      pendingValue: (_) => ChatMessage.fromJson({
        'id': messageId,
        'conversation_id': conversationId,
        'content': content,
        'kind': 'user',
      }),
      send: () async => ChatMessage.fromJson(
        (await _apiClient.patchJson(path, payload))['message']
                as Map<String, dynamic>? ??
            const <String, dynamic>{},
      ),
    );
  }

  Future<ChatMessage> deleteMessage(
    String wsId,
    String conversationId,
    String messageId,
  ) async {
    final path =
        '${_conversationPath(wsId, conversationId)}/messages/$messageId';
    return await queueOrSendValue<ChatMessage>(
      feature: 'chat',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: messageId,
      pendingValue: (_) => ChatMessage.fromJson({
        'id': messageId,
        'conversation_id': conversationId,
        'deleted_at': DateTime.now().toUtc().toIso8601String(),
      }),
      send: () async => ChatMessage.fromJson(
        (await _apiClient.deleteJson(path))['message']
                as Map<String, dynamic>? ??
            const <String, dynamic>{},
      ),
    );
  }

  Future<ChatConversation> markRead(
    String wsId,
    String conversationId, {
    String? messageId,
  }) async {
    final path = '${_conversationPath(wsId, conversationId)}/read';
    final payload = <String, dynamic>{
      if (messageId != null) 'messageId': messageId,
    };
    return await queueOrSendValue<ChatConversation>(
      feature: 'chat',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      entityId: conversationId,
      payload: payload,
      pendingValue: (_) =>
          ChatConversation.fromJson({'id': conversationId, 'ws_id': wsId}),
      send: () async => ChatConversation.fromJson(
        (await _apiClient.postJson(path, payload))['conversation']
                as Map<String, dynamic>? ??
            const <String, dynamic>{},
      ),
    );
  }

  Future<ChatMessage> toggleReaction(
    String wsId,
    String conversationId, {
    required String messageId,
    required String emoji,
  }) async {
    final path = '${_conversationPath(wsId, conversationId)}/reactions';
    final payload = {'messageId': messageId, 'emoji': emoji};
    return await queueOrSendValue<ChatMessage>(
      feature: 'chat',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      entityId: messageId,
      payload: payload,
      pendingValue: (_) => ChatMessage.fromJson({
        'id': messageId,
        'conversation_id': conversationId,
      }),
      send: () async => ChatMessage.fromJson(
        (await _apiClient.postJson(path, payload))['message']
                as Map<String, dynamic>? ??
            const <String, dynamic>{},
      ),
    );
  }

  Future<ChatAttachment> uploadAttachment(
    String wsId,
    String conversationId, {
    required PlatformFile file,
  }) async {
    final builder = BytesBuilder(copy: false);
    await file.readAsByteStream().forEach(builder.add);
    final bytes = builder.takeBytes();
    final contentType = file.name.toLowerCase().endsWith('.m4a')
        ? 'audio/mp4'
        : lookupMimeType(file.name) ?? 'application/octet-stream';
    final path =
        '${_conversationPath(wsId, conversationId)}/attachments/upload-url';
    final localId = newLocalMutationId();
    return await queueOrSendValue<ChatAttachment>(
      feature: 'chat',
      method: 'CHAT_UPLOAD',
      path: path,
      workspaceId: wsId,
      entityId: localId,
      payload: {
        'filename': file.name,
        'contentType': contentType,
        'bytes': base64Encode(bytes),
        'sizeBytes': bytes.length,
      },
      pendingValue: (_) => ChatAttachment(
        id: localId,
        conversationId: conversationId,
        filename: file.name,
        storagePath: localId,
        contentType: contentType,
        sizeBytes: bytes.length,
      ),
      send: () async => ChatAttachment.fromJson(
        await deliverChatAttachment(
          api: _apiClient,
          httpClient: _httpClient,
          uploadPath: path,
          filename: file.name,
          contentType: contentType,
          bytes: bytes,
        ),
      ),
    );
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
