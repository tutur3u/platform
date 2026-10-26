// Relative imports retain the existing Assistant API module layout.
// ignore_for_file: always_use_package_imports

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/chat/data/chat_creation_receipt.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import '../models/assistant_models.dart';
import '../models/assistant_soul_snapshot.dart';
import 'assistant_attachment_upload.dart';
import 'assistant_calendar_insight.dart';
import 'assistant_chat_persistence_contract.dart';
import 'assistant_history_message.dart';
import 'assistant_history_parts.dart';
import 'assistant_reaction_journal.dart';
import 'assistant_reset_preferences.dart';
import 'assistant_settings_selection.dart';
import 'assistant_soul_name_writer.dart';
import 'assistant_soul_reader.dart';
import 'assistant_stream_parser.dart';

part 'assistant_repository_cache.dart';
part 'assistant_repository_settings.dart';
part 'assistant_repository_chat.dart';
part 'assistant_repository_native_receipt.dart';
part 'assistant_repository_reactions.dart';
part 'assistant_repository_creation.dart';
part 'assistant_repository_legacy_stream.dart';
part 'assistant_repository_preferences.dart';
part 'assistant_repository_soul.dart';

class AssistantRepository
    with _AssistantSoulRepository, _AssistantChatRepository {
  AssistantRepository({
    ApiClient? apiClient,
    ApiClient? tasksApiClient,
    http.Client? httpClient,
    ChatRepository? chatRepository,
    String? Function()? currentUserId,
    CacheStore? chatCacheStore,
    AssistantReactionJournal? reactionJournal,
  }) : this._(
         apiClient ?? ApiClient(),
         tasksApiClient ?? ApiClient(baseUrl: ApiConfig.tasksBaseUrl),
         httpClient ?? http.Client(),
         chatRepository,
         currentUserId ?? currentCacheUserId,
         chatCacheStore ?? CacheStore.instance,
         reactionJournal ?? AssistantReactionJournal(),
       );

  AssistantRepository._(
    this._apiClient,
    this._tasksApiClient,
    this._httpClient,
    ChatRepository? chatRepository,
    this._currentUserId,
    this._chatCacheStore,
    this._reactionJournal,
  ) : _chatRepository =
          chatRepository ??
          ChatRepository(apiClient: _apiClient, httpClient: _httpClient);

  @override
  final ApiClient _apiClient;
  final AssistantReactionJournal _reactionJournal;
  final ApiClient _tasksApiClient;
  final http.Client _httpClient;
  @override
  final ChatRepository _chatRepository;
  @override
  final String? Function() _currentUserId;
  String? get currentActorId => _currentUserId();

  @override
  final CacheStore _chatCacheStore;
  SafeErrorDiagnostics? chatCacheDiagnostics;
  final _chatCacheFlights = <String, _AssistantCacheFlight>{};
  final _chatCacheTasks = <Future<void>>{};
  ({
    String key,
    int epoch,
    int revision,
    String payload,
    AssistantChatCacheOrigin origin,
    Future<AssistantChatCachePublication> result,
  })?
  _lastChatSnapshot;

  @override
  AssistantChatCacheOrigin? captureChatCacheOrigin({
    required String wsId,
    required String chatId,
    required bool Function() isCurrent,
  }) =>
      _captureChatCacheOrigin(wsId: wsId, chatId: chatId, isCurrent: isCurrent);
  @override
  Future<AssistantChatCachePublication> publishAssistantChatSnapshot({
    required AssistantChatCacheOrigin origin,
    required AssistantRestoredChat restored,
  }) => _publishAssistantChatSnapshot(origin: origin, restored: restored);
  Future<void> drainAssistantChatCache() => _drainAssistantChatCache();
  Future<void> writeAssistantChatCache({
    required String wsId,
    required String chatId,
    required AssistantRestoredChat restored,
  }) =>
      _writeAssistantChatCache(wsId: wsId, chatId: chatId, restored: restored);

  @override
  void _trackChatCache(Future<void> operation) =>
      _trackChatCacheOperation(operation);
  @override
  AssistantChatCachePublication _cacheFailure(
    AssistantChatCacheOrigin origin,
    Object error,
  ) => _classifyCacheFailure(origin, error);

  int _chatSettingsRevision = 0;
  int _creationGenerationVersion = 0;
  ({
    String scope,
    String fallbackId,
    int version,
    Future<AssistantChatRecord> result,
    String? settingsKey,
  })?
  _generationCreation;

  /// App actor/workspace lifecycle and confirmed reset boundaries invalidate ACKs.
  final _creationEnvelopeKeys = <String>{};
  void invalidateChatCreation({bool retainResetConsent = false}) {
    if (!retainResetConsent) {
      _creationEnvelopeKeys.forEach(AssistantResetPreferences.revokeConsent);
    }
    _lastChatSnapshot = null;
    _creationGenerationVersion++;
    _generationCreation = null;
  }

  Future<AssistantChatRecord> createChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
    ChatInitialAiSettings? initialSettings,
    bool Function()? isCurrent,
  }) => _createBoundChat(
    id: id,
    wsId: wsId,
    modelId: modelId,
    message: message,
    timezone: timezone,
    initialSettings: initialSettings,
    isCurrent: isCurrent,
  );

  static final Random _random = Random.secure();

  static const _assistantChatCacheTag = 'assistant:chat';
  static const _assistantMetadataCacheTag = 'assistant:metadata';
  static const _assistantHistoryCacheTag = 'assistant:history';
  static const CachePolicy _assistantChatCachePolicy = CachePolicies.detail;
  static const CachePolicy _assistantMetadataCachePolicy =
      CachePolicies.metadata;
  static const CachePolicy _assistantInsightCachePolicy = CachePolicies.summary;
  static const CachePolicy _assistantHistoryCachePolicy = CachePolicies.summary;

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
    return AssistantRestoredChat.fromJson(Map<String, dynamic>.from(json));
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

  Future<Set<String>> fetchModelFavorites(String wsId) async {
    return await fetchAssistantModelFavorites(this, wsId);
  }

  Future<void> toggleModelFavorite(
    String wsId,
    String modelId, {
    required bool isFavorited,
  }) async {
    await toggleAssistantModelFavorite(
      this,
      wsId,
      modelId,
      isFavorited: isFavorited,
    );
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
      tags: [_assistantMetadataCacheTag, 'workspace:$wsId', 'module:assistant'],
      fetch: () async {
        final query = Uri(
          queryParameters: {'wsId': wsId, 'isPersonal': isPersonal.toString()},
        ).query;
        final response = await _tasksApiClient.getJson(
          '/api/v1/mira/tasks?$query',
        );
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
        namespace: 'assistant.calendar_insight.v2',
        wsId: wsId,
      ),
      policy: _assistantInsightCachePolicy,
      decode: _decodeCalendarInsightCache,
      forceRefresh: forceRefresh,
      tags: [_assistantMetadataCacheTag, 'workspace:$wsId', 'module:assistant'],
      fetch: () async {
        return (await loadAssistantCalendarInsight(_apiClient, wsId)).toJson();
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
      tags: [_assistantMetadataCacheTag, 'workspace:$wsId', 'module:assistant'],
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
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async {
    if (wsId != null && wsId.isNotEmpty) {
      try {
        final page = await _chatRepository.listConversations(
          wsId,
          limit: limit ?? 40,
        );
        final nativeChats = page.conversations
            .where(
              (conversation) =>
                  conversation.type == ChatConversationType.ai &&
                  !conversation.isReadOnlyAgent &&
                  !conversation.id.startsWith('ai-agent-thread-'),
            )
            .map(_assistantChatRecordFromConversation)
            .toList(growable: false);
        if (nativeChats.isNotEmpty) {
          return limit == null
              ? nativeChats
              : nativeChats.take(limit).toList(growable: false);
        }
      } on ApiException {
        // Fall back to the legacy Assistant history endpoint while older chats
        // are still being migrated into native Chat conversations.
      }
    }

    final result = await CacheStore.instance
        .prefetch<List<AssistantChatRecord>>(
          key: _assistantMetadataCacheKey(
            namespace: 'assistant.recent_chats',
            wsId: wsId,
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
                .map((row) {
                  final record = AssistantChatRecord.fromJson(row);
                  final route = AssistantChatRoute.parse(
                    'ai-chat-${record.id}',
                  );
                  return AssistantChatRecord(
                    id: route.conversationId,
                    title: record.title,
                    model: record.model,
                    isPublic: record.isPublic,
                    createdAt: record.createdAt,
                  );
                })
                .toList(growable: false);
            final limited = limit == null
                ? mapped
                : mapped.take(limit).toList(growable: false);
            return limited.map((chat) => chat.toJson()).toList(growable: false);
          },
        );
    return result.data ?? const <AssistantChatRecord>[];
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
      ignoreWarmupError(fetchCalendarInsight(wsId, forceRefresh: forceRefresh)),
      ignoreWarmupError(fetchCredits(wsId, forceRefresh: forceRefresh)),
      ignoreWarmupError(fetchGatewayModels(forceRefresh: forceRefresh)),
      ignoreWarmupError(
        fetchRecentChats(wsId: wsId, limit: 20, forceRefresh: forceRefresh),
      ),
    ]);
  }

  /// See [AssistantAttachmentUploader] for the per-store routing contract.
  Future<AssistantAttachment> uploadAttachment({
    required String wsId,
    required AssistantFilePickerResult file,
    String? chatId,
    void Function(double progress)? onProgress,
  }) => AssistantAttachmentUploader(
    apiClient: _apiClient,
    httpClient: _httpClient,
  ).upload(wsId: wsId, file: file, chatId: chatId, onProgress: onProgress);

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
      {'paths': normalizedPaths},
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

  @override
  String generateUuid() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    String hex(int value) => value.toRadixString(16).padLeft(2, '0');

    return '${hex(bytes[0])}${hex(bytes[1])}${hex(bytes[2])}${hex(bytes[3])}-'
        '${hex(bytes[4])}${hex(bytes[5])}-'
        '${hex(bytes[6])}${hex(bytes[7])}-'
        '${hex(bytes[8])}${hex(bytes[9])}-'
        '${hex(bytes[10])}${hex(bytes[11])}${hex(bytes[12])}${hex(bytes[13])}'
        '${hex(bytes[14])}${hex(bytes[15])}';
  }
}
