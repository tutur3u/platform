import 'package:flutter/foundation.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const manageTimeTrackingRequestsPermission = 'manage_time_tracking_requests';
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
  WorkspacePermissionsRepository({SupabaseClient? client})
    : _client = client ?? supabase;

  final SupabaseClient _client;

  Future<WorkspacePermissions> getPermissions({
    required String wsId,
    String? userId,
  }) async {
    final currentUserId = userId ?? _client.auth.currentUser?.id;
    if (currentUserId == null || wsId.isEmpty) {
      return const WorkspacePermissions(
        permissions: <String>{},
        isCreator: false,
      );
    }

    try {
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
    } on Exception catch (error) {
      debugPrint('Failed to load workspace permissions: $error');
      return const WorkspacePermissions(
        permissions: <String>{},
        isCreator: false,
      );
    }
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
