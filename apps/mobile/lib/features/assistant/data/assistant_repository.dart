// Assistant feature parity module: targeted lint suppressions keep the API and
// restore logic manageable.
// ignore_for_file: always_use_package_imports, lines_longer_than_80_chars

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
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

  static const _assistantChatCacheTag = 'assistant:chat';
  static const _assistantMetadataCacheTag = 'assistant:metadata';
  static const _assistantHistoryCacheTag = 'assistant:history';
  static const CachePolicy _assistantChatCachePolicy = CachePolicies.detail;
  static const CachePolicy _assistantMetadataCachePolicy =
      CachePolicies.metadata;
  static const CachePolicy _assistantInsightCachePolicy = CachePolicies.summary;
  static const CachePolicy _assistantHistoryCachePolicy = CachePolicies.summary;

  static CacheKey _assistantChatCacheKey({
    required String wsId,
    required String chatId,
  }) {
    return CacheKey(
      namespace: 'assistant.chat_restore',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {'chatId': chatId},
    );
  }

  static CacheKey _assistantMetadataCacheKey({
    required String namespace,
    String? wsId,
    Map<String, String> params = const <String, String>{},
  }) {
    return CacheKey(
      namespace: namespace,
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: params,
    );
  }

  static AssistantRestoredChat _decodeRestoredCache(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid assistant chat cache payload.');
    }
    return AssistantRestoredChat.fromJson(
      Map<String, dynamic>.from(json),
    );
  }

  static AssistantSoul _decodeSoulCache(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid assistant soul cache payload.');
    }
    return AssistantSoul.fromJson(Map<String, dynamic>.from(json));
  }

  static String _decodePersonalWorkspaceCache(Object? json) {
    if (json is! Map) {
      throw const FormatException(
        'Invalid assistant personal workspace cache payload.',
      );
    }
    return json['workspaceId'] as String? ?? '';
  }

  static AssistantTasksInsight _decodeTasksInsightCache(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid assistant tasks cache payload.');
    }
    return AssistantTasksInsight.fromJson(Map<String, dynamic>.from(json));
  }

  static AssistantCalendarInsight _decodeCalendarInsightCache(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid assistant calendar cache payload.');
    }
    return AssistantCalendarInsight.fromJson(Map<String, dynamic>.from(json));
  }

  static AssistantCredits _decodeCreditsCache(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid assistant credits cache payload.');
    }
    return AssistantCredits.fromJson(Map<String, dynamic>.from(json));
  }

  static List<AssistantGatewayModel> _decodeGatewayModelsCache(Object? json) {
    if (json is! List<dynamic>) {
      throw const FormatException('Invalid assistant models cache payload.');
    }
    return json
        .whereType<Map<String, dynamic>>()
        .map(AssistantGatewayModel.fromJson)
        .toList(growable: false);
  }

  static List<AssistantChatRecord> _decodeRecentChatsCache(Object? json) {
    if (json is! List<dynamic>) {
      throw const FormatException('Invalid assistant history cache payload.');
    }
    return json
        .whereType<Map<String, dynamic>>()
        .map(AssistantChatRecord.fromJson)
        .toList(growable: false);
  }

  Future<void> writeAssistantChatCache({
    required String wsId,
    required String chatId,
    required AssistantRestoredChat restored,
  }) async {
    await CacheStore.instance.write(
      key: _assistantChatCacheKey(wsId: wsId, chatId: chatId),
      policy: _assistantChatCachePolicy,
      payload: restored.toJson(),
      tags: [
        _assistantChatCacheTag,
        'workspace:$wsId',
        'module:assistant',
      ],
    );
  }

  Future<String?> resolvePersonalWorkspaceId({
    bool forceRefresh = false,
  }) async {
    final result = await CacheStore.instance.prefetch<String>(
      key: _assistantMetadataCacheKey(
        namespace: 'assistant.personal_workspace',
      ),
      policy: _assistantMetadataCachePolicy,
      decode: _decodePersonalWorkspaceCache,
      forceRefresh: forceRefresh,
      tags: [_assistantMetadataCacheTag, 'module:assistant'],
      fetch: () async {
        final response = await _apiClient.postJson(
          '/api/v1/infrastructure/resolve-workspace-id',
          const {'wsId': 'personal'},
        );
        return {'workspaceId': response['workspaceId'] as String? ?? ''};
      },
    );
    final workspaceId = result.data;
    return workspaceId == null || workspaceId.isEmpty ? null : workspaceId;
  }

  Future<AssistantSoul> fetchSoul({bool forceRefresh = false}) async {
    final result = await CacheStore.instance.prefetch<AssistantSoul>(
      key: _assistantMetadataCacheKey(namespace: 'assistant.soul'),
      policy: _assistantMetadataCachePolicy,
      decode: _decodeSoulCache,
      forceRefresh: forceRefresh,
      tags: [_assistantMetadataCacheTag, 'module:assistant'],
      fetch: () async {
        final response = await _apiClient.getJson('/api/v1/mira/soul');
        return AssistantSoul.fromJson(
          response['soul'] as Map<String, dynamic>?,
        ).toJson();
      },
    );
    return result.data ?? const AssistantSoul();
  }

  Future<AssistantSoul> updateSoulName(String name) async {
    final response = await _apiClient.patchJson('/api/v1/mira/soul', {
      'name': name,
    });
    final soul = AssistantSoul.fromJson(
      response['soul'] as Map<String, dynamic>?,
    );
    await CacheStore.instance.write(
      key: _assistantMetadataCacheKey(namespace: 'assistant.soul'),
      policy: _assistantMetadataCachePolicy,
      payload: soul.toJson(),
      tags: [_assistantMetadataCacheTag, 'module:assistant'],
    );
    return soul;
  }

  Future<AssistantTasksInsight> fetchTasksInsight({
    required String wsId,
    required bool isPersonal,
    bool forceRefresh = false,
  }) async {
    final result = await CacheStore.instance.prefetch<AssistantTasksInsight>(
      key: _assistantMetadataCacheKey(
        namespace: 'assistant.tasks_insight',
        wsId: wsId,
        params: {'isPersonal': isPersonal.toString()},
      ),
      policy: _assistantInsightCachePolicy,
      decode: _decodeTasksInsightCache,
      forceRefresh: forceRefresh,
      tags: [
        _assistantMetadataCacheTag,
        'workspace:$wsId',
        'module:assistant',
      ],
      fetch: () async {
        final query = Uri(
          queryParameters: {
            'wsId': wsId,
            'isPersonal': isPersonal.toString(),
          },
        ).query;
        final response = await _apiClient.getJson('/api/v1/mira/tasks?$query');
        return AssistantTasksInsight.fromJson(response).toJson();
      },
    );
    return result.data ?? const AssistantTasksInsight();
  }

  Future<AssistantCalendarInsight> fetchCalendarInsight(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final result = await CacheStore.instance.prefetch<AssistantCalendarInsight>(
      key: _assistantMetadataCacheKey(
        namespace: 'assistant.calendar_insight',
        wsId: wsId,
      ),
      policy: _assistantInsightCachePolicy,
      decode: _decodeCalendarInsightCache,
      forceRefresh: forceRefresh,
      tags: [
        _assistantMetadataCacheTag,
        'workspace:$wsId',
        'module:assistant',
      ],
      fetch: () async {
        final query = Uri(queryParameters: {'wsId': wsId}).query;
        final response = await _apiClient.getJson(
          '/api/v1/mira/calendar?$query',
        );
        return AssistantCalendarInsight.fromJson(response).toJson();
      },
    );
    return result.data ?? const AssistantCalendarInsight();
  }

  Future<AssistantCredits> fetchCredits(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final result = await CacheStore.instance.prefetch<AssistantCredits>(
      key: _assistantMetadataCacheKey(
        namespace: 'assistant.credits',
        wsId: wsId,
      ),
      policy: _assistantInsightCachePolicy,
      decode: _decodeCreditsCache,
      forceRefresh: forceRefresh,
      tags: [
        _assistantMetadataCacheTag,
        'workspace:$wsId',
        'module:assistant',
      ],
      fetch: () async {
        final response = await _apiClient.getJson(
          '/api/v1/workspaces/$wsId/ai/credits',
        );
        return AssistantCredits.fromJson(response).toJson();
      },
    );
    return result.data ?? const AssistantCredits();
  }

  Future<List<AssistantGatewayModel>> fetchGatewayModels({
    bool forceRefresh = false,
  }) async {
    try {
      final result = await CacheStore.instance
          .prefetch<List<AssistantGatewayModel>>(
            key: _assistantMetadataCacheKey(
              namespace: 'assistant.gateway_models',
            ),
            policy: _assistantMetadataCachePolicy,
            decode: _decodeGatewayModelsCache,
            forceRefresh: forceRefresh,
            tags: [_assistantMetadataCacheTag, 'module:assistant'],
            fetch: () async {
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
                      inputPricePerToken:
                          (model['input_price_per_token'] as num?)?.toDouble(),
                      outputPricePerToken:
                          (model['output_price_per_token'] as num?)?.toDouble(),
                      maxTokens: (model['max_tokens'] as num?)?.toInt(),
                    ),
                  )
                  .map((model) => model.toJson())
                  .toList(growable: false);
            },
          );
      return result.data ?? const <AssistantGatewayModel>[];
    } on Exception catch (_) {
      // Return empty list on permission errors or API failures
      return const [];
    }
  }

  Future<List<AssistantChatRecord>> fetchRecentChats({
    int? limit,
    bool forceRefresh = false,
  }) async {
    final result = await CacheStore.instance
        .prefetch<List<AssistantChatRecord>>(
          key: _assistantMetadataCacheKey(
            namespace: 'assistant.recent_chats',
            params: {'limit': limit?.toString() ?? 'all'},
          ),
          policy: _assistantHistoryCachePolicy,
          decode: _decodeRecentChatsCache,
          forceRefresh: forceRefresh,
          tags: [_assistantHistoryCacheTag, 'module:assistant'],
          fetch: () async {
            final rows = await _apiClient.getJsonList('/api/v1/ai/chats');
            final mapped = rows
                .whereType<Map<String, dynamic>>()
                .map(AssistantChatRecord.fromJson)
                .toList(growable: false);
            final limited = limit == null
                ? mapped
                : mapped.take(limit).toList(growable: false);
            return limited.map((chat) => chat.toJson()).toList(growable: false);
          },
        );
    return result.data ?? const <AssistantChatRecord>[];
  }

  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
  }) async {
    final cacheKey = _assistantChatCacheKey(wsId: wsId, chatId: chatId);

    if (!forceRefresh) {
      final cached = await CacheStore.instance.read<AssistantRestoredChat>(
        key: cacheKey,
        decode: _decodeRestoredCache,
      );
      if (cached.hasValue && cached.data != null && !cached.isExpired) {
        if (!cached.isFresh) {
          unawaited(
            restoreChat(
              wsId: wsId,
              chatId: chatId,
              forceRefresh: true,
            ).catchError((_) => null),
          );
        }
        return cached.data;
      }
    }

    late final Map<String, dynamic> payload;
    try {
      payload = await _apiClient.postJson(
        '/api/ai/chat/restore',
        {'chatId': chatId},
      );
    } on ApiException {
      if (!forceRefresh) {
        final cached = await CacheStore.instance.read<AssistantRestoredChat>(
          key: cacheKey,
          decode: _decodeRestoredCache,
        );
        if (cached.hasValue && cached.data != null && !cached.isExpired) {
          return cached.data;
        }
      }
      return null;
    }

    final chatRaw = payload['chat'];
    if (chatRaw is! Map<String, dynamic>) {
      return null;
    }

    final messagesRaw = payload['messages'];
    final messageRows =
        (messagesRaw is List<dynamic> ? messagesRaw : const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .toList();

    final messages = _restoreMessages(messageRows);

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
      chat: AssistantChatRecord.fromJson(chatRaw),
      messages: messages,
      attachmentsByMessageId: attachmentsByMessageId,
    );

    await CacheStore.instance.write(
      key: cacheKey,
      policy: _assistantChatCachePolicy,
      payload: restored.toJson(),
      tags: [
        _assistantChatCacheTag,
        'workspace:$wsId',
        'module:assistant',
      ],
    );

    return restored;
  }

  Future<void> prewarmWorkspace({
    required String wsId,
    required bool isPersonal,
    bool forceRefresh = false,
  }) async {
    Future<void> ignoreWarmupError(Future<Object?> future) {
      return future.then((_) {}).catchError((_) {});
    }

    await Future.wait([
      ignoreWarmupError(fetchSoul(forceRefresh: forceRefresh)),
      ignoreWarmupError(resolvePersonalWorkspaceId(forceRefresh: forceRefresh)),
      ignoreWarmupError(
        fetchTasksInsight(
          wsId: wsId,
          isPersonal: isPersonal,
          forceRefresh: forceRefresh,
        ),
      ),
      ignoreWarmupError(
        fetchCalendarInsight(wsId, forceRefresh: forceRefresh),
      ),
      ignoreWarmupError(fetchCredits(wsId, forceRefresh: forceRefresh)),
      ignoreWarmupError(fetchGatewayModels(forceRefresh: forceRefresh)),
      ignoreWarmupError(
        fetchRecentChats(limit: 20, forceRefresh: forceRefresh),
      ),
    ]);
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
      signedReadUrl = (await fetchSignedReadUrls([path]))[path];
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

  Future<Map<String, String>> fetchSignedReadUrls(List<String> paths) async {
    final normalizedPaths = paths
        .map((path) => path.trim())
        .where((path) => path.isNotEmpty)
        .toSet()
        .toList(growable: false);
    if (normalizedPaths.isEmpty) {
      return const {};
    }

    final readResponse = await _apiClient.postJson(
      '/api/ai/chat/signed-read-url',
      {
        'paths': normalizedPaths,
      },
    );
    final urls = (readResponse['urls'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>();
    final signedUrlByPath = <String, String>{};
    for (final entry in urls) {
      final path = entry['path'] as String?;
      final signedUrl = entry['signedUrl'] as String?;
      if (path == null ||
          path.isEmpty ||
          signedUrl == null ||
          signedUrl.isEmpty) {
        continue;
      }
      signedUrlByPath[path] = signedUrl;
    }
    return signedUrlByPath;
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
