import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/workspace_secret.dart';
import 'package:mobile/data/models/workspace_storage_rollout.dart';
import 'package:mobile/data/sources/api_client.dart';

class WorkspaceSecretsRepository {
  WorkspaceSecretsRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;
  static const CachePolicy _cachePolicy = CachePolicies.metadata;
  static const _secretsCacheTag = 'settings:workspace-secrets:list';
  static const _rolloutCacheTag = 'settings:workspace-secrets:rollout';

  static CacheKey _secretsCacheKey(String wsId) {
    return CacheKey(
      namespace: 'settings.workspaceSecrets.list',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  static CacheKey _rolloutCacheKey(String wsId) {
    return CacheKey(
      namespace: 'settings.workspaceSecrets.rollout',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  static List<WorkspaceSecret> _decodeSecrets(Object? json) {
    if (json is! List) {
      throw const FormatException('Invalid workspace secrets cache payload.');
    }

    return json
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceSecret.fromJson)
        .toList(growable: false);
  }

  static WorkspaceStorageRolloutState _decodeRolloutState(Object? json) {
    if (json is! Map) {
      throw const FormatException(
        'Invalid workspace storage rollout cache payload.',
      );
    }

    return WorkspaceStorageRolloutState.fromJson(
      Map<String, dynamic>.from(json),
    );
  }

  Future<List<WorkspaceSecret>> _fetchSecretsRemote(String wsId) async {
    final response = await _api.getJsonList(
      WorkspaceSettingsEndpoints.secrets(wsId),
    );
    return response
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceSecret.fromJson)
        .toList(growable: false);
  }

  Future<WorkspaceStorageRolloutState> _fetchRolloutStateRemote(
    String wsId,
  ) async {
    final response = await _api.getJson(
      WorkspaceSettingsEndpoints.storageRolloutState(wsId),
    );
    final payload = response['data'];

    if (payload is Map<String, dynamic>) {
      return WorkspaceStorageRolloutState.fromJson(payload);
    }

    return WorkspaceStorageRolloutState.fromJson(response);
  }

  Future<CacheReadResult<List<WorkspaceSecret>>> readCachedSecrets(
    String wsId,
  ) {
    return CacheStore.instance.read<List<WorkspaceSecret>>(
      key: _secretsCacheKey(wsId),
      decode: _decodeSecrets,
    );
  }

  Future<CacheReadResult<WorkspaceStorageRolloutState>> readCachedRolloutState(
    String wsId,
  ) {
    return CacheStore.instance.read<WorkspaceStorageRolloutState>(
      key: _rolloutCacheKey(wsId),
      decode: _decodeRolloutState,
    );
  }

  Future<List<WorkspaceSecret>> getSecrets(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final cached = await CacheStore.instance.prefetch<List<WorkspaceSecret>>(
      key: _secretsCacheKey(wsId),
      policy: _cachePolicy,
      decode: _decodeSecrets,
      forceRefresh: forceRefresh,
      fetch: () async => (await _fetchSecretsRemote(
        wsId,
      )).map((secret) => secret.toJson()).toList(growable: false),
      tags: [
        _secretsCacheTag,
        'workspace:$wsId',
        'module:settings',
      ],
    );

    return cached.data ?? const [];
  }

  Future<WorkspaceStorageRolloutState> getRolloutState(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final cached = await CacheStore.instance
        .prefetch<WorkspaceStorageRolloutState>(
          key: _rolloutCacheKey(wsId),
          policy: _cachePolicy,
          decode: _decodeRolloutState,
          forceRefresh: forceRefresh,
          fetch: () async => (await _fetchRolloutStateRemote(wsId)).toJson(),
          tags: [
            _rolloutCacheTag,
            'workspace:$wsId',
            'module:settings',
          ],
        );

    if (cached.data == null) {
      throw const FormatException('Missing workspace rollout state payload.');
    }

    return cached.data!;
  }

  Future<void> invalidateWorkspaceCache(String wsId) {
    return CacheStore.instance.invalidateTags(
      [_secretsCacheTag, _rolloutCacheTag],
      workspaceId: wsId,
      userId: currentCacheUserId(),
    );
  }

  Future<void> createSecret({
    required String wsId,
    required String name,
    required String value,
  }) async {
    await _api.postJson(WorkspaceSettingsEndpoints.secrets(wsId), {
      'name': name,
      'value': value,
    });
    await invalidateWorkspaceCache(wsId);
  }

  Future<void> updateSecret({
    required String wsId,
    required String secretId,
    required String name,
    required String value,
  }) async {
    await _api.putJson(WorkspaceSettingsEndpoints.secret(wsId, secretId), {
      'id': secretId,
      'name': name,
      'value': value,
    });
    await invalidateWorkspaceCache(wsId);
  }

  Future<void> deleteSecret({
    required String wsId,
    required String secretId,
  }) async {
    await _api.deleteJson(WorkspaceSettingsEndpoints.secret(wsId, secretId));
    await invalidateWorkspaceCache(wsId);
  }

  Future<WorkspaceStorageMigrationResult> migrateStorage({
    required String wsId,
    required String sourceProvider,
    required String targetProvider,
    bool overwrite = true,
  }) async {
    final response = await _api.postJson(
      WorkspaceSettingsEndpoints.migrateStorage(wsId),
      {
        'sourceProvider': sourceProvider,
        'targetProvider': targetProvider,
        'overwrite': overwrite,
      },
    );
    final payload = response['data'];

    if (payload is Map<String, dynamic>) {
      await invalidateWorkspaceCache(wsId);
      return WorkspaceStorageMigrationResult.fromJson(payload);
    }

    await invalidateWorkspaceCache(wsId);
    return WorkspaceStorageMigrationResult.fromJson(response);
  }
}
