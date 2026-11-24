import 'package:flutter/foundation.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/workspace_secret.dart';
import 'package:mobile/data/models/workspace_storage_rollout.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Workspace secrets are fetched live and never persisted on the device:
/// the list stays in this instance's memory only, and create/update requests
/// (which carry values) bypass the persistent offline queue.
class WorkspaceSecretsRepository {
  WorkspaceSecretsRepository({ApiClient? apiClient, CacheStore? cacheStore})
    : _api = apiClient ?? ApiClient(),
      _cacheStore = cacheStore;

  final ApiClient _api;
  final CacheStore? _cacheStore;
  CacheStore get _cache => _cacheStore ?? CacheStore.instance;
  static const CachePolicy _cachePolicy = CachePolicies.metadata;
  static const _secretsCacheTag = 'settings:workspace-secrets:list';
  static const _rolloutCacheTag = 'settings:workspace-secrets:rollout';
  static const _secretsListNamespace = 'settings.workspaceSecrets.list';

  /// Last list fetched per actor and workspace, kept in memory only so an
  /// offline refresh can still show rows without a persisted copy.
  final Map<String, List<WorkspaceSecret>> _sessionSecrets = {};

  /// Key of the secrets list namespace, kept for regression checks only.
  /// [CacheStore] refuses to persist this namespace and drops any record of
  /// it found on disk when it opens.
  @visibleForTesting
  static CacheKey secretsListCacheKey(String wsId) {
    return CacheKey(
      namespace: _secretsListNamespace,
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

  static String _sessionKey(String wsId) => '${currentCacheUserId()}|$wsId';

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

  /// The secrets list has no persisted cache; this always reports a miss.
  Future<CacheReadResult<List<WorkspaceSecret>>> readCachedSecrets(
    String wsId,
  ) async {
    return const CacheReadResult<List<WorkspaceSecret>>(
      state: CacheEntryState.missing,
    );
  }

  Future<CacheReadResult<WorkspaceStorageRolloutState>> readCachedRolloutState(
    String wsId,
  ) {
    return _cache.read<WorkspaceStorageRolloutState>(
      key: _rolloutCacheKey(wsId),
      decode: _decodeRolloutState,
    );
  }

  /// Fetches the live list. [forceRefresh] is accepted for call-site parity;
  /// every call reaches the server.
  Future<List<WorkspaceSecret>> getSecrets(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final sessionKey = _sessionKey(wsId);
    List<WorkspaceSecret> confirmed;
    try {
      confirmed = await _fetchSecretsRemote(wsId);
      _sessionSecrets[sessionKey] = confirmed;
    } on ApiException catch (error) {
      final remembered = _sessionSecrets[sessionKey];
      if (!isOfflineTransportFailure(error) || remembered == null) rethrow;
      confirmed = remembered;
    }

    final pendingDeletes = {
      for (final edit in OfflineMutationQueue.instance.pending.value)
        if (edit.feature == 'settings' &&
            edit.workspaceId == wsId &&
            edit.method == 'DELETE' &&
            edit.entityId != null &&
            edit.path ==
                WorkspaceSettingsEndpoints.secret(wsId, edit.entityId!))
          edit.entityId!,
    };
    return confirmed
        .where((secret) => !pendingDeletes.contains(secret.id))
        .toList(growable: false);
  }

  Future<WorkspaceStorageRolloutState> getRolloutState(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final cached = await _cache.prefetch<WorkspaceStorageRolloutState>(
      key: _rolloutCacheKey(wsId),
      policy: _cachePolicy,
      decode: _decodeRolloutState,
      forceRefresh: forceRefresh,
      fetch: () async => (await _fetchRolloutStateRemote(wsId)).toJson(),
      tags: [_rolloutCacheTag, 'workspace:$wsId', 'module:settings'],
    );

    if (cached.data == null) {
      throw const FormatException('Missing workspace rollout state payload.');
    }

    return cached.data!;
  }

  Future<void> invalidateWorkspaceCache(String wsId) {
    return _cache.invalidateTags(
      [_secretsCacheTag, _rolloutCacheTag],
      workspaceId: wsId,
      userId: currentCacheUserId(),
    );
  }

  /// Sends directly; an offline failure surfaces to the caller instead of
  /// persisting the value in the offline queue.
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

  /// Sends directly like [createSecret]. With [keepValue] the server keeps
  /// the stored value and [value] is ignored.
  Future<void> updateSecret({
    required String wsId,
    required String secretId,
    required String name,
    String? value,
    bool keepValue = false,
  }) async {
    if (!keepValue && value == null) {
      throw ArgumentError.value(value, 'value', 'Required unless keepValue');
    }
    final payload = keepValue
        ? <String, dynamic>{'name': name, 'keepValue': true}
        : <String, dynamic>{'name': name, 'value': value};
    await _api.putJson(
      WorkspaceSettingsEndpoints.secret(wsId, secretId),
      payload,
    );
    await invalidateWorkspaceCache(wsId);
  }

  Future<void> deleteSecret({
    required String wsId,
    required String secretId,
  }) async {
    final path = WorkspaceSettingsEndpoints.secret(wsId, secretId);
    await queueOrSendVoid(
      feature: 'settings',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: secretId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
    final sessionKey = _sessionKey(wsId);
    if (_sessionSecrets[sessionKey] case final remembered?) {
      _sessionSecrets[sessionKey] = remembered
          .where((secret) => secret.id != secretId)
          .toList(growable: false);
    }
    await invalidateWorkspaceCache(wsId);
  }

  Future<WorkspaceStorageMigrationResult> migrateStorage({
    required String wsId,
    required String sourceProvider,
    required String targetProvider,
    bool overwrite = true,
  }) async {
    final response = await _api
        .postJson(WorkspaceSettingsEndpoints.migrateStorage(wsId), {
          'sourceProvider': sourceProvider,
          'targetProvider': targetProvider,
          'overwrite': overwrite,
        });
    final payload = response['data'];

    if (payload is Map<String, dynamic>) {
      await invalidateWorkspaceCache(wsId);
      return WorkspaceStorageMigrationResult.fromJson(payload);
    }

    await invalidateWorkspaceCache(wsId);
    return WorkspaceStorageMigrationResult.fromJson(response);
  }
}
