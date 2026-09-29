import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/sources/api_client.dart';

class WorkspaceManagementRepository {
  WorkspaceManagementRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<List<WorkspaceRoleListItem>> getRoles(String wsId) async {
    final response = await readThroughJsonList(
      api: _api,
      namespace: 'settings.roles',
      workspaceId: wsId,
      path: WorkspaceSettingsEndpoints.roles(wsId),
    );
    final roles = response
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceRoleListItem.fromJson)
        .toList();
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature != 'workspace-management' || item.workspaceId != wsId) {
        continue;
      }
      if (item.method == 'POST' &&
          item.path == WorkspaceSettingsEndpoints.roles(wsId)) {
        roles.add(
          WorkspaceRoleListItem(
            id: item.entityId ?? '',
            name: item.payload?['name'] as String? ?? '',
          ),
        );
      } else if (item.method == 'PUT' && item.entityId != null) {
        final index = roles.indexWhere((role) => role.id == item.entityId);
        if (index >= 0) {
          roles[index] = WorkspaceRoleListItem(
            id: roles[index].id,
            name: item.payload?['name'] as String? ?? roles[index].name,
            createdAt: roles[index].createdAt,
          );
        }
      }
    }
    return roles;
  }

  Future<WorkspaceRoleDetail> getDefaultRole(String wsId) async {
    final response = Map<String, dynamic>.from(
      await readThroughJson(
        api: _api,
        namespace: 'settings.defaultRole',
        workspaceId: wsId,
        path: WorkspaceSettingsEndpoints.defaultRole(wsId),
      ),
    );
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature == 'workspace-management' &&
          item.workspaceId == wsId &&
          item.path == WorkspaceSettingsEndpoints.defaultRole(wsId)) {
        response['permissions'] = item.payload?['permissions'];
      }
    }
    return WorkspaceRoleDetail.fromJson(response);
  }

  Future<WorkspaceRoleDetail> getRole(String wsId, String roleId) async {
    final pending = await OfflineMutationQueue.instance.listPending();
    final created = pending
        .where(
          (item) =>
              item.feature == 'workspace-management' &&
              item.workspaceId == wsId &&
              item.method == 'POST' &&
              item.entityId == roleId,
        )
        .firstOrNull;
    final response = created == null
        ? Map<String, dynamic>.from(
            await readThroughJson(
              api: _api,
              namespace: 'settings.role',
              workspaceId: wsId,
              path: WorkspaceSettingsEndpoints.role(wsId, roleId),
            ),
          )
        : <String, dynamic>{...?created.payload, 'id': roleId};
    for (final item in pending) {
      if (item.feature == 'workspace-management' &&
          item.workspaceId == wsId &&
          item.entityId == roleId &&
          item.method == 'PUT') {
        response.addAll(item.payload ?? const {});
      }
    }
    return WorkspaceRoleDetail.fromJson(response);
  }

  Future<List<WorkspaceRoleMember>> getRoleMembers(
    String wsId,
    String roleId,
  ) async {
    final pending = await OfflineMutationQueue.instance.listPending();
    final localRole = pending.any(
      (item) =>
          item.feature == 'workspace-management' &&
          item.workspaceId == wsId &&
          item.method == 'POST' &&
          item.path == WorkspaceSettingsEndpoints.roles(wsId) &&
          item.entityId == roleId,
    );
    final response = localRole
        ? <String, dynamic>{'data': <dynamic>[]}
        : await readThroughJson(
            api: _api,
            namespace: 'settings.roleMembers',
            workspaceId: wsId,
            path: WorkspaceSettingsEndpoints.roleMembers(wsId, roleId),
          );
    final members = (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceRoleMember.fromJson)
        .toList();
    for (final item in pending) {
      if (item.feature != 'workspace-management' ||
          item.workspaceId != wsId ||
          item.path != WorkspaceSettingsEndpoints.roleMembers(wsId, roleId) ||
          item.method != 'POST') {
        continue;
      }
      for (final id
          in item.payload?['memberIds'] as List<dynamic>? ?? const []) {
        if (id is String && !members.any((member) => member.id == id)) {
          members.add(WorkspaceRoleMember(id: id));
        }
      }
    }
    return members;
  }

  Future<void> createRole({
    required String wsId,
    required String name,
    required Map<String, bool> permissions,
  }) async {
    final path = WorkspaceSettingsEndpoints.roles(wsId);
    final payload = {
      'name': name,
      'permissions': permissions.entries
          .map((entry) => {'id': entry.key, 'enabled': entry.value})
          .toList(growable: false),
    };
    await queueOrSendVoid(
      feature: 'workspace-management',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      send: () async {
        await _api.postJson(path, payload);
      },
    );
  }

  Future<void> updateRole({
    required String wsId,
    required String roleId,
    required String name,
    required Map<String, bool> permissions,
  }) async {
    final path = WorkspaceSettingsEndpoints.role(wsId, roleId);
    final payload = {
      'name': name,
      'permissions': permissions.entries
          .map((entry) => {'id': entry.key, 'enabled': entry.value})
          .toList(growable: false),
    };
    await queueOrSendVoid(
      feature: 'workspace-management',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      entityId: roleId,
      payload: payload,
      send: () async {
        await _api.putJson(path, payload);
      },
    );
  }

  Future<void> updateDefaultPermissions({
    required String wsId,
    required Map<String, bool> permissions,
  }) async {
    final path = WorkspaceSettingsEndpoints.defaultRole(wsId);
    final payload = {
      'permissions': permissions.entries
          .map((entry) => {'id': entry.key, 'enabled': entry.value})
          .toList(growable: false),
    };
    await queueOrSendVoid(
      feature: 'workspace-management',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      entityId: 'default',
      payload: payload,
      send: () async {
        await _api.putJson(path, payload);
      },
    );
  }

  Future<void> deleteRole({
    required String wsId,
    required String roleId,
  }) async {
    final path = WorkspaceSettingsEndpoints.role(wsId, roleId);
    await queueOrSendVoid(
      feature: 'workspace-management',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: roleId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
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
      final path = WorkspaceSettingsEndpoints.roleMembers(wsId, roleId);
      final payload = {'memberIds': toAdd};
      await queueOrSendVoid(
        feature: 'workspace-management',
        method: 'POST',
        path: path,
        workspaceId: wsId,
        entityId: roleId,
        payload: payload,
        send: () async {
          await _api.postJson(path, payload);
        },
      );
    }

    for (final userId in toRemove) {
      final path = WorkspaceSettingsEndpoints.roleMember(wsId, roleId, userId);
      await queueOrSendVoid(
        feature: 'workspace-management',
        method: 'DELETE',
        path: path,
        workspaceId: wsId,
        entityId: userId,
        send: () async {
          await _api.deleteJson(path);
        },
      );
    }
  }

  Future<List<WorkspaceMemberListItem>> getMembers(String wsId) async {
    final response = await readThroughJsonList(
      api: _api,
      namespace: 'settings.members',
      workspaceId: wsId,
      path: WorkspaceSettingsEndpoints.membersEnhanced(wsId),
    );
    final members = response
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceMemberListItem.fromJson)
        .toList();
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature == 'workspace-management' &&
          item.workspaceId == wsId &&
          item.method == 'POST' &&
          item.path == WorkspaceSettingsEndpoints.inviteMember(wsId)) {
        members.add(
          WorkspaceMemberListItem(
            id: item.entityId ?? '',
            pending: true,
            isCreator: false,
            roles: const [],
            email: item.payload?['email'] as String?,
          ),
        );
      }
    }
    return members;
  }

  Future<void> inviteMember({
    required String wsId,
    required String email,
  }) async {
    final path = WorkspaceSettingsEndpoints.inviteMember(wsId);
    final payload = {'email': email};
    await queueOrSendVoid(
      feature: 'workspace-management',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      send: () async {
        await _api.postJson(path, payload);
      },
    );
  }

  Future<void> removeMember({
    required String wsId,
    String? userId,
    String? email,
  }) async {
    final path = WorkspaceSettingsEndpoints.members(
      wsId,
      userId: userId,
      email: email,
    );
    await queueOrSendVoid(
      feature: 'workspace-management',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: userId ?? email,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }

  Future<List<WorkspaceInviteLink>> getInviteLinks(String wsId) async {
    final response = await readThroughJsonList(
      api: _api,
      namespace: 'settings.inviteLinks',
      workspaceId: wsId,
      path: WorkspaceSettingsEndpoints.inviteLinks(wsId),
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
    final path = WorkspaceSettingsEndpoints.inviteLinks(wsId);
    final payload = {
      'maxUses': maxUses,
      'expiresAt': expiresAt?.toUtc().toIso8601String(),
    };
    await queueOrSendVoid(
      feature: 'workspace-management',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      send: () async {
        await _api.postJson(path, payload);
      },
    );
  }

  Future<void> deleteInviteLink({
    required String wsId,
    required String linkId,
  }) async {
    final path = WorkspaceSettingsEndpoints.inviteLink(wsId, linkId);
    await queueOrSendVoid(
      feature: 'workspace-management',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: linkId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }
}
