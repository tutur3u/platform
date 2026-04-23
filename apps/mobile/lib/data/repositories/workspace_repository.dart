import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/models/user_profile.dart';
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
  static const _workspaceSubscriptionTierSelect =
      'workspace_subscriptions!left(created_at, status, '
      'workspace_subscription_products(tier))';
  static const _workspaceWithTierSelect =
      '$_workspaceBaseSelect, $_workspaceSubscriptionTierSelect';
  static const CachePolicy _workspacesCachePolicy = CachePolicies.metadata;
  static const _workspacesCacheTag = 'workspace:list';

  final ApiClient _api;
  final http.Client _httpClient;
  static const _selectedKey = 'selected-workspace';

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
    final list = await _api.getJsonList('/api/v1/workspaces');
    return list
        .whereType<Map<String, dynamic>>()
        .map(_workspaceFromJson)
        .whereType<Workspace>()
        .toList(growable: false);
  }

  /// Fetches workspaces the current user belongs to.
  Future<List<Workspace>> getWorkspaces() async {
    final workspaces = await _fetchWorkspacesRemote();
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
          return getWorkspaceById(defaultId);
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
        return getWorkspaceById(personalId);
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

    await supabase
        .from('user_private_details')
        .update({'default_workspace_id': workspaceId})
        .eq('user_id', userId);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_defaultWorkspaceIdKey, workspaceId);
  }

  Future<String?> loadDefaultWorkspaceId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_defaultWorkspaceIdKey);
  }

  /// Fetches a single workspace by ID.
  Future<Workspace?> getWorkspaceById(String wsId) async {
    Map<String, dynamic>? response;
    try {
      response = await supabase
          .from('workspaces')
          .select(_workspaceWithTierSelect)
          .eq('id', wsId)
          .maybeSingle();
    } on Object {
      response = await supabase
          .from('workspaces')
          .select(_workspaceBaseSelect)
          .eq('id', wsId)
          .maybeSingle();
    }

    if (response == null) return null;
    return _workspaceFromJson(response);
  }

  /// Persists the selected workspace to SharedPreferences.
  Future<void> saveSelectedWorkspace(Workspace workspace) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_selectedKey, jsonEncode(workspace.toJson()));
  }

  /// Loads the previously selected workspace from SharedPreferences.
  Future<Workspace?> loadSelectedWorkspace() async {
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_selectedKey);
    if (json == null) return null;

    try {
      return _workspaceFromJson(
        jsonDecode(json) as Map<String, dynamic>,
      );
    } on Object catch (_) {
      return null;
    }
  }

  /// Clears the selected workspace.
  Future<void> clearSelectedWorkspace() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_selectedKey);
    await prefs.remove(_defaultWorkspaceIdKey);
  }

  /// Fetches workspace creation limits for the current user.
  Future<WorkspaceLimits> getWorkspaceLimits() async {
    final json = await _api.getJson('/api/v1/workspaces/limits');
    return WorkspaceLimits.fromJson(json);
  }

  /// Creates a new team workspace with the given [name].
  ///
  /// Returns the created [WorkspaceCreationResult] or throws [ApiException].
  Future<WorkspaceCreationResult> createWorkspace(
    String name, {
    File? avatarFile,
  }) async {
    final json = await _api.postJson(
      WorkspaceEndpoints.team,
      {
        'name': name,
      },
    );

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

    // Fetch the full workspace to get all fields
    final ws = await getWorkspaceById(wsId);
    if (ws == null) {
      throw const ApiException(
        message: 'Workspace created but could not be fetched',
        statusCode: 0,
      );
    }
    return WorkspaceCreationResult(
      workspace: ws,
      avatarUploadFailed: avatarUploadFailed,
    );
  }

  Future<void> updateWorkspaceName(String wsId, String name) async {
    await _api.putJson(WorkspaceEndpoints.workspace(wsId), {'name': name});
  }

  Future<void> updateWorkspaceAvatar(String wsId, File avatarFile) async {
    final uploadJson = await _api.postJson(
      WorkspaceEndpoints.avatarUploadUrl(wsId),
      {
        'filename': avatarFile.uri.pathSegments.last,
      },
    );
    final upload = AvatarUploadUrlResponse.fromJson(uploadJson);

    final bytes = await avatarFile.readAsBytes();
    final contentType =
        lookupMimeType(avatarFile.path) ?? 'application/octet-stream';
    final uploadResponse = await _httpClient
        .put(
          Uri.parse(upload.uploadUrl),
          headers: {
            'Authorization': 'Bearer ${upload.token}',
            'Content-Type': contentType,
          },
          body: bytes,
        )
        .timeout(const Duration(seconds: 60));

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      throw ApiException(
        message: 'Failed to upload workspace avatar',
        statusCode: uploadResponse.statusCode,
      );
    }

    await _api.patchJson(WorkspaceEndpoints.avatar(wsId), {
      'filePath': upload.filePath,
    });
  }

  Future<void> removeWorkspaceAvatar(String wsId) async {
    await _api.deleteJson(WorkspaceEndpoints.avatar(wsId));
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
