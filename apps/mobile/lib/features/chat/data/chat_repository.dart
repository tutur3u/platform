import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
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
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/chat/conversations?$query',
    );
    return ChatConversationPage.fromJson(response);
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
    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/chat/conversations',
      {
        'type': type.name,
        if (title != null) 'title': title,
        if (description != null) 'description': description,
        if (participantUserIds.isNotEmpty)
          'participantUserIds': participantUserIds,
        if (aiEnabled != null) 'aiEnabled': aiEnabled,
        if (autoReply != null) 'autoReply': autoReply,
        if (modelId != null) 'modelId': modelId,
        if (systemPrompt != null) 'systemPrompt': systemPrompt,
      },
    );
    return ChatConversation.fromJson(
      response['conversation'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );
  }

  Future<ChatConversation> updateConversation(
    String wsId,
    String conversationId, {
    String? title,
    String? description,
    bool? pinned,
  }) async {
    final response = await _apiClient.patchJson(
      _conversationPath(wsId, conversationId),
      {
        if (title != null) 'title': title,
        if (description != null) 'description': description,
        if (pinned != null) 'pinned': pinned,
      },
    );
    return ChatConversation.fromJson(
      response['conversation'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );
  }

  Future<void> deleteConversation(String wsId, String conversationId) async {
    await _apiClient.deleteJson(_conversationPath(wsId, conversationId));
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
    final response = await _apiClient.getJson(
      '${_conversationPath(wsId, conversationId)}/messages?$query',
    );
    return (response['messages'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ChatMessage.fromJson)
        .toList(growable: false);
  }

  Stream<ChatMessageStreamEvent> sendMessageStream(
    String wsId,
    String conversationId, {
    required String content,
    ChatMessageKind kind = ChatMessageKind.user,
    List<ChatAttachmentDraft> attachments = const [],
    String? replyToMessageId,
  }) async* {
    final response = await _apiClient.sendJsonStream(
      'POST',
      '${_conversationPath(wsId, conversationId)}/messages',
      {
        'content': content,
        'kind': kind.name,
        'attachments': attachments
            .map((attachment) => attachment.toJson())
            .toList(growable: false),
        if (replyToMessageId != null) 'replyToMessageId': replyToMessageId,
      },
      accept: 'application/x-ndjson',
    );

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
    final bytes =
        file.bytes ??
        (file.path == null ? null : await File(file.path!).readAsBytes());
    if (bytes == null) {
      throw const ApiException(
        message: 'Unable to read selected file',
        statusCode: 0,
      );
    }
    final contentType =
        lookupMimeType(file.name, headerBytes: bytes) ??
        'application/octet-stream';

    final uploadPayload = await _apiClient.postJson(
      '${_conversationPath(wsId, conversationId)}/attachments/upload-url',
      {
        'filename': file.name,
        'contentType': contentType,
        'sizeBytes': bytes.length,
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

    var uploadResponse = await _httpClient.put(
      Uri.parse(signedUrl),
      headers: uploadHeaders,
      body: bytes,
    );

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      final fallbackHeaders = <String, String>{...uploadHeaders}
        ..remove('Content-Type');
      uploadResponse = await _httpClient.put(
        Uri.parse(signedUrl),
        headers: fallbackHeaders,
        body: bytes,
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
