// Assistant feature parity module: targeted lint suppressions keep the API and
// restore logic manageable.
// ignore_for_file: always_use_package_imports, lines_longer_than_80_chars

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';

import '../models/assistant_models.dart';
import 'assistant_stream_parser.dart';

class AssistantRepository {
  AssistantRepository({
    ApiClient? apiClient,
    http.Client? httpClient,
  }) : _apiClient = apiClient ?? ApiClient(),
       _httpClient = httpClient ?? http.Client();

  final ApiClient _apiClient;
  final http.Client _httpClient;
  static final Random _random = Random.secure();

  Future<String?> resolvePersonalWorkspaceId() async {
    final response = await _apiClient.postJson(
      '/api/v1/infrastructure/resolve-workspace-id',
      const {'wsId': 'personal'},
    );
    return response['workspaceId'] as String?;
  }

  Future<AssistantSoul> fetchSoul() async {
    final response = await _apiClient.getJson('/api/v1/mira/soul');
    return AssistantSoul.fromJson(response['soul'] as Map<String, dynamic>?);
  }

  Future<AssistantSoul> updateSoulName(String name) async {
    final response = await _apiClient.patchJson('/api/v1/mira/soul', {
      'name': name,
    });
    return AssistantSoul.fromJson(response['soul'] as Map<String, dynamic>?);
  }

  Future<AssistantTasksInsight> fetchTasksInsight({
    required String wsId,
    required bool isPersonal,
  }) async {
    final query = Uri(
      queryParameters: {
        'wsId': wsId,
        'isPersonal': isPersonal.toString(),
      },
    ).query;
    final response = await _apiClient.getJson('/api/v1/mira/tasks?$query');
    return AssistantTasksInsight.fromJson(response);
  }

  Future<AssistantCalendarInsight> fetchCalendarInsight(String wsId) async {
    final query = Uri(queryParameters: {'wsId': wsId}).query;
    final response = await _apiClient.getJson('/api/v1/mira/calendar?$query');
    return AssistantCalendarInsight.fromJson(response);
  }

  Future<AssistantCredits> fetchCredits(String wsId) async {
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/ai/credits',
    );
    return AssistantCredits.fromJson(response);
  }

  Future<List<AssistantGatewayModel>> fetchGatewayModels() async {
    try {
      final models = await _apiClient.getJsonList(
        '/api/v1/infrastructure/ai/models',
      );
      return models
          .whereType<Map<String, dynamic>>()
          .map(
            (model) => AssistantGatewayModel(
              value: model['id'] as String,
              label: model['name'] as String? ?? model['id'] as String,
              provider: model['provider'] as String? ?? 'google',
              description: model['description'] as String?,
              context: (model['context_window'] as num?)?.toInt(),
              disabled: !(model['is_enabled'] as bool? ?? true),
              tags: (model['tags'] as List<dynamic>? ?? const [])
                  .map((tag) => tag.toString())
                  .toList(),
              inputPricePerToken: (model['input_price_per_token'] as num?)
                  ?.toDouble(),
              outputPricePerToken: (model['output_price_per_token'] as num?)
                  ?.toDouble(),
              maxTokens: (model['max_tokens'] as num?)?.toInt(),
            ),
          )
          .toList();
    } on Exception catch (_) {
      // Return empty list on permission errors or API failures
      return const [];
    }
  }

  Future<List<AssistantChatRecord>> fetchRecentChats({int limit = 20}) async {
    final response = await supabase
        .from('ai_chats')
        .select('id, title, model, is_public, created_at')
        .order('created_at', ascending: false)
        .limit(limit);

    return (response as List<dynamic>)
        .whereType<Map<String, dynamic>>()
        .map(AssistantChatRecord.fromJson)
        .toList();
  }

  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
  }) async {
    final chatData = await supabase
        .from('ai_chats')
        .select('id, title, model, is_public, created_at')
        .eq('id', chatId)
        .maybeSingle();

    if (chatData == null) return null;

    final messagesData = await supabase
        .from('ai_chat_messages')
        .select('id, role, content, metadata, created_at')
        .eq('chat_id', chatId)
        .order('created_at', ascending: true);

    final messages = _restoreMessages(
      (messagesData as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .toList(),
    );

    final attachmentResponse = await _apiClient.postJson(
      '/api/ai/chat/file-urls',
      {
        'wsId': wsId,
        'chatId': chatId,
      },
    );

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

      for (final raw
          in (messagesData as List<dynamic>)
              .whereType<Map<String, dynamic>>()) {
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

    return AssistantRestoredChat(
      chat: AssistantChatRecord.fromJson(chatData),
      messages: messages,
      attachmentsByMessageId: attachmentsByMessageId,
    );
  }

  Future<AssistantChatRecord> createChat({
    required String id,
    required String modelId,
    required String message,
    required String timezone,
  }) async {
    final response = await _apiClient.postJson('/api/ai/chat/new', {
      'id': id,
      'model': modelId,
      'message': message,
      'isMiraMode': true,
      'timezone': timezone,
    });

    return AssistantChatRecord(
      id: response['id'] as String,
      title: response['title'] as String?,
      model: modelId,
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
    String? creditWsId,
  }) async* {
    final token = await _ensureAccessToken();
    final request = http.Request(
      'POST',
      Uri.parse('${ApiConfig.baseUrl}/api/ai/chat'),
    );
    request.headers.addAll({
      'Accept': 'text/event-stream',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    });
    request.body = jsonEncode({
      'id': chatId,
      'wsId': wsId,
      'workspaceContextId': workspaceContextId,
      'model': modelId,
      'messages': messages.map((message) => message.toJson()).toList(),
      'isMiraMode': true,
      'timezone': timezone,
      'thinkingMode': thinkingMode.name,
      'creditSource': creditSource.name,
      if (creditWsId != null) 'creditWsId': creditWsId,
    });

    final response = await _httpClient.send(request);
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

  Future<AssistantAttachment> uploadAttachment({
    required String wsId,
    required AssistantFilePickerResult file,
    String? chatId,
  }) async {
    final uploadResponse = await _apiClient.postJson(
      '/api/ai/chat/upload-url',
      {
        'filename': file.name,
        'wsId': wsId,
        if (chatId != null) 'chatId': chatId,
      },
    );

    final signedUrl = uploadResponse['signedUrl'] as String;
    final token = uploadResponse['token'] as String;
    final path = uploadResponse['path'] as String;
    final bytes = file.file.bytes ?? await File(file.path).readAsBytes();

    final initialType = _uploadContentType(file.mimeType);
    var response = await _httpClient.put(
      Uri.parse(signedUrl),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': initialType,
      },
      body: bytes,
    );

    if (!response.isSuccessful) {
      final body = response.body;
      if (body.toLowerCase().contains('unsupported mime type')) {
        response = await _httpClient.put(
          Uri.parse(signedUrl),
          headers: {'Authorization': 'Bearer $token'},
          body: bytes,
        );
      }
    }

    if (!response.isSuccessful) {
      throw ApiException(
        message: response.body.isEmpty ? 'Upload failed' : response.body,
        statusCode: response.statusCode,
      );
    }

    String? signedReadUrl;
    try {
      final readResponse = await _apiClient.postJson(
        '/api/ai/chat/signed-read-url',
        {
          'paths': [path],
        },
      );
      final urls = (readResponse['urls'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>();
      final matchingUrls = urls.where((url) => url['path'] == path);
      if (matchingUrls.isNotEmpty) {
        signedReadUrl = matchingUrls.first['signedUrl'] as String?;
      }
    } on Object {
      signedReadUrl = null;
    }

    return AssistantAttachment(
      id: file.id,
      name: file.name,
      size: file.size,
      type: file.mimeType,
      localPath: file.path,
      storagePath: path,
      signedUrl: signedReadUrl,
      uploadState: AssistantAttachmentUploadState.uploaded,
    );
  }

  Future<void> deleteAttachment({
    required String wsId,
    required String path,
  }) async {
    await _apiClient.postJson('/api/ai/chat/delete-file', {
      'wsId': wsId,
      'path': path,
    });
  }

  List<AssistantMessage> _restoreMessages(
    List<Map<String, dynamic>> messagesData,
  ) {
    return messagesData
        .where((message) {
          final metadata = message['metadata'] as Map<String, dynamic>?;
          return message['content'] != null ||
              metadata?['toolCalls'] != null ||
              metadata?['reasoning'] != null ||
              metadata?['sources'] != null;
        })
        .map((message) {
          final parts = <AssistantMessagePart>[];
          final metadata = message['metadata'] as Map<String, dynamic>?;
          final reasoning = metadata?['reasoning'] as String?;
          final toolCalls = metadata?['toolCalls'] as List<dynamic>?;
          final toolResults = metadata?['toolResults'] as List<dynamic>?;
          final sources = metadata?['sources'] as List<dynamic>?;

          if (reasoning != null && reasoning.isNotEmpty) {
            parts.add(AssistantMessagePart(type: 'reasoning', text: reasoning));
          }

          final content = message['content'] as String?;
          if (content != null && content.isNotEmpty) {
            parts.add(AssistantMessagePart(type: 'text', text: content));
          }

          for (final rawToolCall in toolCalls ?? const <dynamic>[]) {
            if (rawToolCall is! Map<String, dynamic>) continue;
            final toolCallId = rawToolCall['toolCallId'] as String?;
            Map<String, dynamic>? toolResult;
            for (final result
                in (toolResults ?? const <dynamic>[])
                    .whereType<Map<String, dynamic>>()) {
              if (result['toolCallId'] == toolCallId) {
                toolResult = result;
                break;
              }
            }
            parts.add(
              AssistantMessagePart(
                type: 'dynamic-tool',
                toolName: rawToolCall['toolName'] as String?,
                toolCallId: toolCallId,
                state: 'output-available',
                input:
                    rawToolCall['input'] ??
                    rawToolCall['args'] ??
                    const <String, dynamic>{},
                output: toolResult?['output'] ?? toolResult?['result'],
              ),
            );
          }

          for (final rawSource in sources ?? const <dynamic>[]) {
            if (rawSource is! Map<String, dynamic>) continue;
            parts.add(
              AssistantMessagePart(
                type: 'source-url',
                sourceId: rawSource['sourceId'] as String?,
                url: rawSource['url'] as String?,
                title: rawSource['title'] as String?,
              ),
            );
          }

          return AssistantMessage(
            id: message['id'] as String,
            role: _normalizeRole(message['role'] as String?),
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

  Future<String> _ensureAccessToken() async {
    var token = supabase.auth.currentSession?.accessToken;
    if (token != null && token.isNotEmpty) {
      return token;
    }

    final refreshed = await supabase.auth.refreshSession();
    token = refreshed.session?.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException(message: 'Unauthorized', statusCode: 401);
    }

    return token;
  }

  String _uploadContentType(String mimeType) {
    const officeTypes = {
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    if (officeTypes.contains(mimeType.toLowerCase())) {
      return 'application/octet-stream';
    }
    return mimeType.isEmpty ? 'application/octet-stream' : mimeType;
  }

  String generateUuid() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    String hex(int value) => value.toRadixString(16).padLeft(2, '0');

    return '${hex(bytes[0])}${hex(bytes[1])}${hex(bytes[2])}${hex(bytes[3])}-'
        '${hex(bytes[4])}${hex(bytes[5])}-'
        '${hex(bytes[6])}${hex(bytes[7])}-'
        '${hex(bytes[8])}${hex(bytes[9])}-'
        '${hex(bytes[10])}${hex(bytes[11])}${hex(bytes[12])}${hex(bytes[13])}${hex(bytes[14])}${hex(bytes[15])}';
  }
}

extension on http.Response {
  bool get isSuccessful => statusCode >= 200 && statusCode < 300;
}
