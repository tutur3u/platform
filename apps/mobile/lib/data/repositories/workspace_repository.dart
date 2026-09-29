import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/workspace_avatar_delivery.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_limits.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Repository for workspace operations.
///
/// Ported from apps/native/lib/stores/workspace-store.ts.
class WorkspaceRepository {
  WorkspaceRepository({ApiClient? apiClient, http.Client? httpClient})
    : _api = apiClient ?? ApiClient(),
      _httpClient = httpClient ?? http.Client();

  static const _workspaceBaseSelect =
      'id, name, personal, avatar_url, created_at';
  static const CachePolicy _workspacesCachePolicy = CachePolicies.metadata;
  static const _workspacesCacheTag = 'workspace:list';

  final ApiClient _api;
  final http.Client _httpClient;
  static const _selectedKey = 'selected-workspace';

  CacheKey? _selectedReplicaKey() {
    final userId = currentCacheUserId();
    if (userId == null) return null;
    return CacheKey(
      namespace: 'workspace.selected',
      userId: userId,
      workspaceId: 'personal',
    );
  }

  CacheKey? _defaultReplicaKey() {
    final userId = currentCacheUserId();
    if (userId == null) return null;
    return CacheKey(
      namespace: 'workspace.default',
      userId: userId,
      workspaceId: 'personal',
    );
  }

  Future<String> _resolvedWorkspaceId(String id) async {
    final userId = currentCacheUserId();
    if (userId == null) return id;
    final mappings = await CacheStore.instance.localIdMappings(
      userId: userId,
      workspaceId: id,
      feature: 'workspace',
    );
    return mappings[id] ?? id;
  }

  String? _resolveWorkspaceAvatarUrl(String? value) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) return null;
    final uri = Uri.tryParse(trimmed);
    if (uri != null && uri.hasScheme && uri.host.isNotEmpty) {
      return trimmed;
    }
    final supabaseUrl = maybeSupabase?.storage
        .from('avatars')
        .getPublicUrl(trimmed);
    if (supabaseUrl != null) {
      return supabaseUrl;
    }

    var baseUrl = Env.supabaseUrl.replaceAll(RegExp(r'/$'), '');
    if (Platform.isAndroid && baseUrl.contains('localhost')) {
      baseUrl = baseUrl.replaceAll('localhost', '10.0.2.2');
    }

    return '$baseUrl/storage/v1/object/public/avatars/$trimmed';
  }

  Workspace _workspaceFromJson(Map<String, dynamic> json) {
    final normalized = Map<String, dynamic>.from(json);
    normalized['avatar_url'] = _resolveWorkspaceAvatarUrl(
      normalized['avatar_url'] as String?,
    );
    normalized['tier'] =
        normalized['tier'] ?? _resolveWorkspaceTier(normalized);
    return Workspace.fromJson(normalized);
  }

  String _resolveWorkspaceTier(Map<String, dynamic> json) {
    final rawSubscriptions = json['workspace_subscriptions'];
    if (rawSubscriptions is! List) {
      return workspaceTierFree;
    }

    final activeSubscriptions =
        rawSubscriptions
            .whereType<Map<String, dynamic>>()
            .map(Map<String, dynamic>.from)
            .where((subscription) => subscription['status'] == 'active')
            .toList()
          ..sort((a, b) {
            final aCreatedAt = DateTime.tryParse(
              a['created_at'] as String? ?? '',
            )?.millisecondsSinceEpoch;
            final bCreatedAt = DateTime.tryParse(
              b['created_at'] as String? ?? '',
            )?.millisecondsSinceEpoch;
            return (bCreatedAt ?? 0).compareTo(aCreatedAt ?? 0);
          });

    for (final subscription in activeSubscriptions) {
      final product = subscription['workspace_subscription_products'];
      if (product is Map<String, dynamic> && product['tier'] is String) {
        return normalizeWorkspaceTier(product['tier'] as String);
      }

      if (product is List) {
        for (final entry in product.whereType<Map<String, dynamic>>()) {
          final tier = entry['tier'];
          if (tier is String) {
            return normalizeWorkspaceTier(tier);
          }
        }
      }
    }

    return workspaceTierFree;
  }

  static const _defaultWorkspaceIdKey = 'default-workspace-id';

  static CacheKey _workspacesCacheKey() {
    return CacheKey(
      namespace: 'workspace.list',
      userId: currentCacheUserId(),
      locale: currentCacheLocaleTag(),
    );
  }

  List<Workspace> _decodeWorkspaces(Object? json) {
    if (json is! List) {
      throw const FormatException('Invalid workspace cache payload.');
    }

    return json
        .whereType<Map<String, dynamic>>()
        .map(_workspaceFromJson)
        .toList(growable: false);
  }

  Future<List<Workspace>> _fetchWorkspacesRemote() async {
    final list = await readThroughJsonList(
      api: _api,
      namespace: 'workspace.list',
      workspaceId: 'personal',
      path: '/api/v1/workspaces',
    );
    return list
        .whereType<Map<String, dynamic>>()
        .map(_workspaceFromJson)
        .whereType<Workspace>()
        .toList(growable: false);
  }

  /// Fetches workspaces the current user belongs to.
  Future<List<Workspace>> getWorkspaces() async {
    final workspaces = (await _fetchWorkspacesRemote()).toList();
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature == 'workspace' &&
          item.method == 'WORKSPACE_CREATE' &&
          item.entityId != null &&
          !workspaces.any((workspace) => workspace.id == item.entityId)) {
        workspaces.add(
          Workspace(id: item.entityId!, name: item.payload?['name'] as String?),
        );
      }
    }
    await saveCachedWorkspaces(workspaces);
    return workspaces;
  }

  Future<CacheReadResult<List<Workspace>>> readCachedWorkspaces() {
    return CacheStore.instance.read<List<Workspace>>(
      key: _workspacesCacheKey(),
      decode: _decodeWorkspaces,
    );
  }

  Future<void> saveCachedWorkspaces(List<Workspace> workspaces) {
    return CacheStore.instance.write(
      key: _workspacesCacheKey(),
      policy: _workspacesCachePolicy,
      payload: workspaces.map((workspace) => workspace.toJson()).toList(),
      tags: const [_workspacesCacheTag],
    );
  }

  /// Fetches the server-side default workspace for the current user.
  ///
  /// Mirrors `getUserDefaultWorkspace()` from the web app:
  /// 1. Read `default_workspace_id` from `user_private_details`
  /// 2. Validate the user has access to that workspace
  /// 3. Fall back to personal workspace if invalid/unset
  Future<Workspace?> getDefaultWorkspace() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return null;

    try {
      final row = await supabase
          .from('user_private_details')
          .select('default_workspace_id')
          .eq('user_id', userId)
          .maybeSingle();

      final defaultId = row?['default_workspace_id'] as String?;

      if (defaultId != null) {
        // Validate user still has access to this workspace
        final member = await supabase
            .from('workspace_members')
            .select('ws_id')
            .eq('user_id', userId)
            .eq('ws_id', defaultId)
            .maybeSingle();

        if (member != null) {
          return await getWorkspaceById(defaultId);
        }
      }

      // Fallback: find personal workspace
      final personalRow = await supabase
          .from('workspace_members')
          .select('ws_id, workspaces!inner(id)')
          .eq('user_id', userId)
          .eq('workspaces.personal', true)
          .maybeSingle();

      final personalId = personalRow?['ws_id'] as String?;
      if (personalId != null) {
        return await getWorkspaceById(personalId);
      }
    } on Object catch (_) {
      // Non-critical — caller falls back to SharedPreferences
    }

    return null;
  }

  /// Persists the default workspace on the server.
  Future<void> updateDefaultWorkspace(String workspaceId) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;
    await queueOrSendVoid(
      feature: 'workspace',
      method: 'WORKSPACE_DEFAULT',
      path: '/local/workspace-default',
      workspaceId: workspaceId,
      entityId: workspaceId,
      payload: {'workspaceId': workspaceId},
      send: () async {
        await supabase
            .from('user_private_details')
            .update({'default_workspace_id': workspaceId})
            .eq('user_id', userId);
      },
    );

    final prefs = await SharedPreferences.getInstance();
    final key = _defaultReplicaKey();
    if (key == null) {
      await prefs.setString(_defaultWorkspaceIdKey, workspaceId);
    } else {
      await CacheStore.instance.write(
        key: key,
        policy: CachePolicies.offlineCatalog,
        payload: {'workspaceId': workspaceId},
        tags: const ['module:workspace', 'workspace:personal'],
      );
      await prefs.remove(_defaultWorkspaceIdKey);
    }
  }

  Future<String?> loadDefaultWorkspaceId() async {
    final key = _defaultReplicaKey();
    if (key != null) {
      final cached = await CacheStore.instance.read<String>(
        key: key,
        decode: (data) => (data! as Map)['workspaceId'] as String,
      );
      if (cached.data != null) {
        return await _resolvedWorkspaceId(cached.data!);
      }
    }
    final prefs = await SharedPreferences.getInstance();
    final legacyId = prefs.getString(_defaultWorkspaceIdKey);
    if (legacyId != null && key != null) {
      await CacheStore.instance.write(
        key: key,
        policy: CachePolicies.offlineCatalog,
        payload: {'workspaceId': legacyId},
        tags: const ['module:workspace', 'workspace:personal'],
      );
      await prefs.remove(_defaultWorkspaceIdKey);
    }
    return legacyId == null ? null : await _resolvedWorkspaceId(legacyId);
  }

  /// Fetches a single workspace by ID.
  Future<Workspace?> getWorkspaceById(String wsId) async {
    final pending = (await OfflineMutationQueue.instance.listPending())
        .where(
          (item) =>
              item.feature == 'workspace' &&
              item.method == 'WORKSPACE_CREATE' &&
              item.entityId == wsId,
        )
        .firstOrNull;
    if (pending != null) {
      return Workspace(id: wsId, name: pending.payload?['name'] as String?);
    }
    Map<String, dynamic>? response;
    try {
      response = await supabase
          .from('workspaces')
          .select(_workspaceBaseSelect)
          .eq('id', wsId)
          .maybeSingle();
    } on Object catch (error) {
      if (error is! SocketException &&
          error is! TimeoutException &&
          error is! http.ClientException) {
        rethrow;
      }
      final cached = await readCachedWorkspaces();
      for (final workspace in cached.data ?? const <Workspace>[]) {
        if (workspace.id == wsId) return workspace;
      }
      rethrow;
    }

    if (response == null) return null;
    return _workspaceFromJson(response);
  }

  /// Persists selection in the encrypted account-scoped replica.
  Future<void> saveSelectedWorkspace(Workspace workspace) async {
    final key = _selectedReplicaKey();
    if (key != null) {
      await CacheStore.instance.write(
        key: key,
        policy: CachePolicies.offlineCatalog,
        payload: workspace.toJson(),
        tags: const ['module:workspace', 'workspace:personal'],
      );
    }
    final prefs = await SharedPreferences.getInstance();
    if (key == null) {
      await prefs.setString(_selectedKey, jsonEncode(workspace.toJson()));
    } else {
      await prefs.remove(_selectedKey);
    }
  }

  /// Loads selection and migrates the previous preferences snapshot.
  Future<Workspace?> loadSelectedWorkspace() async {
    final key = _selectedReplicaKey();
    if (key != null) {
      final cached = await CacheStore.instance.read<Workspace>(
        key: key,
        decode: (data) =>
            _workspaceFromJson(Map<String, dynamic>.from(data! as Map)),
      );
      if (cached.data != null) {
        final selected = cached.data!;
        final serverId = await _resolvedWorkspaceId(selected.id);
        return serverId == selected.id
            ? selected
            : Workspace(
                id: serverId,
                name: selected.name,
                avatarUrl: selected.avatarUrl,
                personal: selected.personal,
                tier: selected.tier,
                createdAt: selected.createdAt,
              );
      }
    }
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_selectedKey);
    if (json == null) return null;

    try {
      final workspace = _workspaceFromJson(
        jsonDecode(json) as Map<String, dynamic>,
      );
      await saveSelectedWorkspace(workspace);
      return workspace;
    } on Object catch (_) {
      return null;
    }
  }

  /// Clears the selected workspace.
  Future<void> clearSelectedWorkspace() async {
    final key = _selectedReplicaKey();
    if (key != null) await CacheStore.instance.remove(key);
    final defaultKey = _defaultReplicaKey();
    if (defaultKey != null) await CacheStore.instance.remove(defaultKey);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_selectedKey);
    await prefs.remove(_defaultWorkspaceIdKey);
  }

  /// Fetches workspace creation limits for the current user.
  Future<WorkspaceLimits> getWorkspaceLimits() async {
    final json = await readThroughJson(
      api: _api,
      namespace: 'workspace.limits',
      workspaceId: 'personal',
      path: '/api/v1/workspaces/limits',
      policy: CachePolicies.metadata,
    );
    return WorkspaceLimits.fromJson(json);
  }

  /// Creates a new team workspace with the given [name].
  ///
  /// Returns the created [WorkspaceCreationResult] or throws [ApiException].
  Future<WorkspaceCreationResult> createWorkspace(
    String name, {
    File? avatarFile,
  }) async {
    final localId = newLocalMutationId();
    final payload = <String, dynamic>{'name': name};
    if (avatarFile != null) {
      payload.addAll({
        'avatarFilename': avatarFile.uri.pathSegments.last,
        'avatarContentType':
            lookupMimeType(avatarFile.path) ?? 'application/octet-stream',
        'avatarBytes': base64Encode(await avatarFile.readAsBytes()),
      });
    }
    return await queueOrSendValue<WorkspaceCreationResult>(
      feature: 'workspace',
      method: 'WORKSPACE_CREATE',
      path: WorkspaceEndpoints.team,
      workspaceId: localId,
      entityId: localId,
      payload: payload,
      pendingValue: (id) => WorkspaceCreationResult(
        workspace: Workspace(id: id, name: name),
        avatarUploadFailed: false,
      ),
      send: () => _createRemoteWorkspace(name, avatarFile: avatarFile),
    );
  }

  Future<WorkspaceCreationResult> _createRemoteWorkspace(
    String name, {
    File? avatarFile,
  }) async {
    final json = await _api.postJson(WorkspaceEndpoints.team, {'name': name});

    final wsId = json['id'] as String;
    var avatarUploadFailed = false;

    if (avatarFile != null) {
      try {
        await updateWorkspaceAvatar(wsId, avatarFile);
      } on Exception catch (_) {
        // Workspace creation already succeeded; avatar upload is best-effort.
        avatarUploadFailed = true;
      }
    }

    // Creation is already committed. A detail-read outage must never turn it
    // into another queued create and duplicate the workspace on replay.
    Workspace? ws;
    try {
      ws = await getWorkspaceById(wsId);
    } on Object {
      ws = null;
    }
    return WorkspaceCreationResult(
      workspace: ws ?? Workspace(id: wsId, name: name),
      avatarUploadFailed: avatarUploadFailed,
    );
  }

  Future<void> updateWorkspaceName(String wsId, String name) async {
    final path = WorkspaceEndpoints.workspace(wsId);
    final payload = {'name': name};
    await queueOrSendVoid(
      feature: 'workspace',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      entityId: wsId,
      payload: payload,
      send: () async {
        await _api.putJson(path, payload);
      },
    );
  }

  Future<void> updateWorkspaceAvatar(String wsId, File avatarFile) async {
    final bytes = await avatarFile.readAsBytes();
    final encodedBytes = base64Encode(bytes);
    final filename = avatarFile.uri.pathSegments.last;
    final contentType =
        lookupMimeType(avatarFile.path) ?? 'application/octet-stream';
    await queueOrSendVoid(
      feature: 'workspace',
      method: 'WORKSPACE_AVATAR_UPLOAD',
      path: WorkspaceEndpoints.avatar(wsId),
      workspaceId: wsId,
      entityId: wsId,
      payload: {
        'filename': filename,
        'contentType': contentType,
        'bytes': encodedBytes,
      },
      send: () => deliverWorkspaceAvatar(
        api: _api,
        httpClient: _httpClient,
        workspaceId: wsId,
        filename: filename,
        contentType: contentType,
        encodedBytes: encodedBytes,
      ),
    );
  }

  Future<void> removeWorkspaceAvatar(String wsId) async {
    final path = WorkspaceEndpoints.avatar(wsId);
    await queueOrSendVoid(
      feature: 'workspace',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: wsId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }

  Future<List<String>> getMobileHiddenModuleIds(String wsId) async {
    final json = await readThroughJson(
      api: _api,
      namespace: 'workspace.mobileModuleFlags',
      workspaceId: wsId,
      path: WorkspaceEndpoints.mobileModuleFlags(wsId),
      policy: CachePolicies.metadata,
    );
    final rawIds = json['hiddenModuleIds'];
    if (rawIds is! List) {
      return const [];
    }

    return rawIds
        .whereType<String>()
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList(growable: false)
      ..sort();
  }
}

class WorkspaceCreationResult {
  const WorkspaceCreationResult({
    required this.workspace,
    required this.avatarUploadFailed,
  });

  final Workspace workspace;
  final bool avatarUploadFailed;
}
