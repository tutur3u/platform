import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/sources/api_client.dart';

class WorkspaceManagementRepository {
  WorkspaceManagementRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<List<WorkspaceRoleListItem>> getRoles(String wsId) async {
    final response = await _api.getJsonList(
      WorkspaceSettingsEndpoints.roles(wsId),
    );
    return response
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceRoleListItem.fromJson)
        .toList(growable: false);
  }

  Future<WorkspaceRoleDetail> getDefaultRole(String wsId) async {
    final response = await _api.getJson(
      WorkspaceSettingsEndpoints.defaultRole(wsId),
    );
    return WorkspaceRoleDetail.fromJson(response);
  }

  Future<WorkspaceRoleDetail> getRole(String wsId, String roleId) async {
    final response = await _api.getJson(
      WorkspaceSettingsEndpoints.role(wsId, roleId),
    );
    return WorkspaceRoleDetail.fromJson(response);
  }

  Future<List<WorkspaceRoleMember>> getRoleMembers(
    String wsId,
    String roleId,
  ) async {
    final response = await _api.getJson(
      WorkspaceSettingsEndpoints.roleMembers(wsId, roleId),
    );
    return (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceRoleMember.fromJson)
        .toList(growable: false);
  }

  Future<void> createRole({
    required String wsId,
    required String name,
    required Map<String, bool> permissions,
  }) async {
    await _api.postJson(WorkspaceSettingsEndpoints.roles(wsId), {
      'name': name,
      'permissions': permissions.entries
          .map((entry) => {'id': entry.key, 'enabled': entry.value})
          .toList(growable: false),
    });
  }

  Future<void> updateRole({
    required String wsId,
    required String roleId,
    required String name,
    required Map<String, bool> permissions,
  }) async {
    await _api.putJson(WorkspaceSettingsEndpoints.role(wsId, roleId), {
      'name': name,
      'permissions': permissions.entries
          .map((entry) => {'id': entry.key, 'enabled': entry.value})
          .toList(growable: false),
    });
  }

  Future<void> updateDefaultPermissions({
    required String wsId,
    required Map<String, bool> permissions,
  }) async {
    await _api.putJson(WorkspaceSettingsEndpoints.defaultRole(wsId), {
      'permissions': permissions.entries
          .map((entry) => {'id': entry.key, 'enabled': entry.value})
          .toList(growable: false),
    });
  }

  Future<void> deleteRole({
    required String wsId,
    required String roleId,
  }) async {
    await _api.deleteJson(WorkspaceSettingsEndpoints.role(wsId, roleId));
  }

  Future<void> replaceRoleMembers({
    required String wsId,
    required String roleId,
    required Set<String> currentMemberIds,
    required Set<String> selectedMemberIds,
  }) async {
    final toAdd = selectedMemberIds.difference(currentMemberIds).toList();
    final toRemove = currentMemberIds.difference(selectedMemberIds).toList();

    if (toAdd.isNotEmpty) {
      await _api.postJson(
        WorkspaceSettingsEndpoints.roleMembers(wsId, roleId),
        {
          'memberIds': toAdd,
        },
      );
    }

    for (final userId in toRemove) {
      await _api.deleteJson(
        WorkspaceSettingsEndpoints.roleMember(wsId, roleId, userId),
      );
    }
  }

  Future<List<WorkspaceMemberListItem>> getMembers(String wsId) async {
    final response = await _api.getJsonList(
      WorkspaceSettingsEndpoints.membersEnhanced(wsId),
    );
    return response
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceMemberListItem.fromJson)
        .toList(growable: false);
  }

  Future<void> inviteMember({
    required String wsId,
    required String email,
  }) async {
    await _api.postJson(WorkspaceSettingsEndpoints.inviteMember(wsId), {
      'email': email,
    });
  }

  Future<void> removeMember({
    required String wsId,
    String? userId,
    String? email,
  }) async {
    await _api.deleteJson(
      WorkspaceSettingsEndpoints.members(
        wsId,
        userId: userId,
        email: email,
      ),
    );
  }

  Future<List<WorkspaceInviteLink>> getInviteLinks(String wsId) async {
    final response = await _api.getJsonList(
      WorkspaceSettingsEndpoints.inviteLinks(wsId),
    );
    return response
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceInviteLink.fromJson)
        .toList(growable: false);
  }

  Future<void> createInviteLink({
    required String wsId,
    int? maxUses,
    DateTime? expiresAt,
  }) async {
    await _api.postJson(WorkspaceSettingsEndpoints.inviteLinks(wsId), {
      'maxUses': maxUses,
      'expiresAt': expiresAt?.toUtc().toIso8601String(),
    });
  }

  Future<void> deleteInviteLink({
    required String wsId,
    required String linkId,
  }) async {
    await _api.deleteJson(WorkspaceSettingsEndpoints.inviteLink(wsId, linkId));
  }
}
