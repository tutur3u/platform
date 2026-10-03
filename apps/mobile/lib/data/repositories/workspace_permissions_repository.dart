import 'dart:io';

import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const manageTimeTrackingRequestsPermission = 'manage_time_tracking_requests';
const bypassTimeTrackingRequestApprovalPermission =
    'bypass_time_tracking_request_approval';
const manageWorkspaceSettingsPermission = 'manage_workspace_settings';
const manageWorkspaceRolesPermission = 'manage_workspace_roles';
const String _workspaceRolePermissionsPrefix = 'workspace_roles!inner(';
const String _workspaceRolePermissionsSuffix =
    'workspace_role_permissions(permission, enabled))';
const String _workspaceRolePermissionsSelect =
    _workspaceRolePermissionsPrefix + _workspaceRolePermissionsSuffix;

class WorkspacePermissions {
  const WorkspacePermissions({
    required this.permissions,
    required this.isCreator,
  });

  final Set<String> permissions;
  final bool isCreator;

  bool get isAdmin => permissions.contains('admin');

  bool containsPermission(String permission) {
    return isCreator || isAdmin || permissions.contains(permission);
  }

  bool withoutPermission(String permission) {
    return !containsPermission(permission);
  }
}

class WorkspacePermissionsRepository {
  WorkspacePermissionsRepository({
    SupabaseClient? client,
    CacheStore? cacheStore,
    String? Function()? currentUserId,
    Future<bool> Function()? networkAvailable,
  }) : _client = client ?? supabase,
       _store = cacheStore ?? CacheStore.instance,
       _currentUserId = currentUserId,
       _networkAvailable = networkAvailable ?? hasNetworkConnection;

  final Map<String, int> _generations = {};
  Future<void> _hintWrites = Future<void>.value();

  Future<void> _updateHint(
    String scope,
    int generation,
    Future<void> Function() write,
  ) {
    final pending = _hintWrites.then((_) async {
      if (_generations[scope] == generation) await write();
    });
    _hintWrites = pending.then<void>((_) {}, onError: (Object _) {});
    return pending;
  }

  final SupabaseClient _client;
  final CacheStore _store;
  final String? Function()? _currentUserId;
  final Future<bool> Function() _networkAvailable;
  String? get _actorId =>
      _currentUserId?.call() ??
      (_currentUserId == null ? _client.auth.currentUser?.id : null);
  static const _denied = WorkspacePermissions(
    permissions: <String>{},
    isCreator: false,
  );

  CacheKey _key(String wsId, String userId) => CacheKey(
    namespace: 'workspace.permissions',
    userId: userId,
    workspaceId: wsId,
  );

  Map<String, dynamic> _payload(WorkspacePermissions value) => {
    'permissions': value.permissions.toList(),
    'isCreator': value.isCreator,
  };

  bool _isAuthDenial(Object error) =>
      error is PostgrestException &&
          {
            '401',
            '403',
            '42501',
            'PGRST301',
            'PGRST302',
          }.contains(error.code) ||
      error is AuthException && {'401', '403'}.contains(error.statusCode);

  void _checkActor(String userId) {
    if (_actorId != userId) {
      throw StateError('Permission actor changed.');
    }
  }

  /// Saves a strict offline UI hint. Server authorization still governs replay.
  Future<void> prepareOffline(String wsId) async {
    final actor = _actorId;
    if (actor == null || wsId.isEmpty) {
      throw StateError('Offline permissions require a signed-in workspace.');
    }
    try {
      if (!await _networkAvailable()) {
        throw const SocketException('Offline permission download unavailable.');
      }
      _checkActor(actor);
      final permissions = await _resolvePermissions(wsId, actor);
      _checkActor(actor);
      final manifest = OfflineDownloadManifest(_store, actor, () => _actorId);
      await manifest.save(_key(wsId, actor), _payload(permissions));
      await manifest.verify();
      _checkActor(actor);
      manifest.retain('permissions', wsId);
    } on Object catch (error) {
      if (_isAuthDenial(error) || _actorId != actor) {
        await _store.remove(_key(wsId, actor));
      }
      rethrow;
    }
  }

  Future<WorkspacePermissions> getPermissions({
    required String wsId,
    String? userId,
  }) async {
    final actor = _actorId;
    final target = userId ?? actor;
    if (actor == null || target != actor || wsId.isEmpty) {
      return _denied;
    }
    final key = _key(wsId, actor);
    final generation = (_generations[key.value] ?? 0) + 1;
    _generations[key.value] = generation;
    if (!await _networkAvailable()) {
      return await _readHint(wsId, actor);
    }
    if (_actorId != actor) return _denied;
    try {
      // Always refresh online; a stored grant never bypasses the server read.
      final permissions = await _resolvePermissions(wsId, actor);
      if (_actorId != actor || _generations[key.value] != generation) {
        return _denied;
      }
      try {
        await _updateHint(
          key.value,
          generation,
          () => _store.write(
            key: key,
            policy: CachePolicies.offlineCatalog,
            payload: _payload(permissions),
          ),
        );
        if (_actorId != actor) {
          await _store.remove(key);
          return _denied;
        }
      } on Object {
        // Disk failure does not discard a freshly authorized server response.
      }
      return _actorId == actor ? permissions : _denied;
    } on Object catch (error) {
      if (_isAuthDenial(error)) {
        await _updateHint(key.value, generation, () => _store.remove(key));
        return _denied;
      }
      if (_actorId != actor || !isOfflineTransportFailure(error)) {
        return _denied;
      }
      return await _readHint(wsId, actor);
    }
  }

  /// Scoped, previously server-verified UI hint; never grants unknown access.
  WorkspacePermissions? peekPermissions(String wsId) {
    final actor = _actorId;
    if (actor == null || wsId.isEmpty) return null;
    try {
      final result = _store.peek<WorkspacePermissions>(
        key: _key(wsId, actor),
        decode: _decodeHint,
      );
      return _actorId == actor ? result.data : null;
    } on Object {
      return null;
    }
  }

  Future<WorkspacePermissions> readCachedPermissions(String wsId) async {
    final actor = _actorId;
    return actor == null ? _denied : await _readHint(wsId, actor);
  }

  WorkspacePermissions _decodeHint(Object? raw) {
    final row = Map<String, dynamic>.from(raw! as Map);
    return WorkspacePermissions(
      permissions: (row['permissions'] as List).whereType<String>().toSet(),
      isCreator: row['isCreator'] == true,
    );
  }

  Future<WorkspacePermissions> _readHint(String wsId, String actor) async {
    if (_actorId != actor) return _denied;
    try {
      final cached = await _store.read<WorkspacePermissions>(
        key: _key(wsId, actor),
        decode: (raw) {
          final row = Map<String, dynamic>.from(raw! as Map);
          return WorkspacePermissions(
            permissions: (row['permissions'] as List)
                .whereType<String>()
                .toSet(),
            isCreator: row['isCreator'] == true,
          );
        },
      );
      return _actorId == actor ? cached.data ?? _denied : _denied;
    } on Object {
      return _denied;
    }
  }

  Future<WorkspacePermissions> _resolvePermissions(
    String wsId,
    String currentUserId,
  ) async {
    final responses = await Future.wait<dynamic>([
      _client
          .from('workspace_role_members')
          .select(_workspaceRolePermissionsSelect)
          .eq('user_id', currentUserId)
          .eq('workspace_roles.ws_id', wsId)
          .eq('workspace_roles.workspace_role_permissions.enabled', true),
      _client
          .from('workspaces')
          .select('creator_id')
          .eq('id', wsId)
          .maybeSingle(),
      _client
          .from('workspace_default_permissions')
          .select('permission')
          .eq('ws_id', wsId)
          .eq('enabled', true),
    ]);

    final rolePermissionRows =
        (responses[0] as List<dynamic>?) ?? const <dynamic>[];
    final workspaceRow = responses[1] as Map<String, dynamic>?;
    final defaultPermissionRows =
        (responses[2] as List<dynamic>?) ?? const <dynamic>[];

    final isCreator = workspaceRow?['creator_id'] == currentUserId;
    if (isCreator) {
      return const WorkspacePermissions(
        permissions: <String>{},
        isCreator: true,
      );
    }

    final combinedPermissions = <String>{
      ..._extractRolePermissions(rolePermissionRows),
      ..._extractDefaultPermissions(defaultPermissionRows),
    };

    return WorkspacePermissions(
      permissions: combinedPermissions,
      isCreator: false,
    );
  }

  Set<String> _extractRolePermissions(List<dynamic> rows) {
    final permissions = <String>{};

    for (final row in rows) {
      if (row is! Map<String, dynamic>) {
        continue;
      }

      final workspaceRoles = row['workspace_roles'];
      if (workspaceRoles is! Map<String, dynamic>) {
        continue;
      }

      final rolePermissions = workspaceRoles['workspace_role_permissions'];
      if (rolePermissions is! List<dynamic>) {
        continue;
      }

      for (final permissionRow in rolePermissions) {
        if (permissionRow is! Map<String, dynamic>) {
          continue;
        }
        final permission = permissionRow['permission'];
        if (permission is String && permission.isNotEmpty) {
          permissions.add(permission);
        }
      }
    }

    return permissions;
  }

  Set<String> _extractDefaultPermissions(List<dynamic> rows) {
    final permissions = <String>{};

    for (final row in rows) {
      if (row is! Map<String, dynamic>) {
        continue;
      }
      final permission = row['permission'];
      if (permission is String && permission.isNotEmpty) {
        permissions.add(permission);
      }
    }

    return permissions;
  }
}
