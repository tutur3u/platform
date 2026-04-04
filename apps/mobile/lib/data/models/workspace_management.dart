class WorkspaceRolePermissionState {
  const WorkspaceRolePermissionState({
    required this.id,
    required this.enabled,
  });

  factory WorkspaceRolePermissionState.fromJson(Map<String, dynamic> json) {
    return WorkspaceRolePermissionState(
      id: (json['id'] ?? json['permission'] ?? '').toString(),
      enabled: json['enabled'] as bool? ?? false,
    );
  }

  final String id;
  final bool enabled;
}

class WorkspaceRoleListItem {
  const WorkspaceRoleListItem({
    required this.id,
    required this.name,
    this.createdAt,
  });

  factory WorkspaceRoleListItem.fromJson(Map<String, dynamic> json) {
    return WorkspaceRoleListItem(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      createdAt: json['created_at']?.toString(),
    );
  }

  final String id;
  final String name;
  final String? createdAt;
}

class WorkspaceRoleDetail {
  const WorkspaceRoleDetail({
    required this.id,
    required this.name,
    required this.permissions,
    this.createdAt,
  });

  factory WorkspaceRoleDetail.fromJson(Map<String, dynamic> json) {
    final permissions =
        (json['permissions'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(WorkspaceRolePermissionState.fromJson)
            .toList(growable: false);

    return WorkspaceRoleDetail(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      permissions: permissions,
      createdAt: json['created_at']?.toString(),
    );
  }

  final String id;
  final String name;
  final List<WorkspaceRolePermissionState> permissions;
  final String? createdAt;
}

class WorkspaceRoleMember {
  const WorkspaceRoleMember({
    required this.id,
    this.displayName,
    this.fullName,
    this.email,
    this.avatarUrl,
  });

  factory WorkspaceRoleMember.fromJson(Map<String, dynamic> json) {
    return WorkspaceRoleMember(
      id: (json['id'] ?? json['user_id'] ?? '').toString(),
      displayName: json['display_name']?.toString(),
      fullName: json['full_name']?.toString(),
      email: json['email']?.toString(),
      avatarUrl: json['avatar_url']?.toString(),
    );
  }

  final String id;
  final String? displayName;
  final String? fullName;
  final String? email;
  final String? avatarUrl;

  String get label {
    final preferred = displayName ?? fullName;
    if (preferred != null && preferred.trim().isNotEmpty) {
      return preferred.trim();
    }
    if (email != null && email!.trim().isNotEmpty) {
      return email!.trim();
    }
    return id;
  }
}

class WorkspaceMemberRoleSummary {
  const WorkspaceMemberRoleSummary({
    required this.id,
    required this.name,
  });

  factory WorkspaceMemberRoleSummary.fromJson(Map<String, dynamic> json) {
    return WorkspaceMemberRoleSummary(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
    );
  }

  final String id;
  final String name;
}

class WorkspaceMemberListItem {
  const WorkspaceMemberListItem({
    required this.id,
    required this.pending,
    required this.isCreator,
    required this.roles,
    this.handle,
    this.email,
    this.displayName,
    this.avatarUrl,
    this.createdAt,
  });

  factory WorkspaceMemberListItem.fromJson(Map<String, dynamic> json) {
    return WorkspaceMemberListItem(
      id: (json['id'] ?? '').toString(),
      pending: json['pending'] as bool? ?? false,
      isCreator: json['is_creator'] as bool? ?? false,
      roles: (json['roles'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(WorkspaceMemberRoleSummary.fromJson)
          .toList(growable: false),
      handle: json['handle']?.toString(),
      email: json['email']?.toString(),
      displayName: json['display_name']?.toString(),
      avatarUrl: json['avatar_url']?.toString(),
      createdAt: json['created_at']?.toString(),
    );
  }

  final String id;
  final bool pending;
  final bool isCreator;
  final List<WorkspaceMemberRoleSummary> roles;
  final String? handle;
  final String? email;
  final String? displayName;
  final String? avatarUrl;
  final String? createdAt;

  String get label {
    final preferred = displayName;
    if (preferred != null && preferred.trim().isNotEmpty) {
      return preferred.trim();
    }
    if (email != null && email!.trim().isNotEmpty) {
      return email!.trim();
    }
    if (handle != null && handle!.trim().isNotEmpty) {
      return '@${handle!.trim()}';
    }
    return id;
  }
}

class WorkspaceInviteLink {
  const WorkspaceInviteLink({
    required this.id,
    required this.code,
    required this.currentUses,
    required this.isExpired,
    required this.isFull,
    this.maxUses,
    this.expiresAt,
    this.createdAt,
  });

  factory WorkspaceInviteLink.fromJson(Map<String, dynamic> json) {
    return WorkspaceInviteLink(
      id: (json['id'] ?? '').toString(),
      code: (json['code'] ?? '').toString(),
      currentUses: (json['current_uses'] as num?)?.toInt() ?? 0,
      isExpired: json['is_expired'] as bool? ?? false,
      isFull: json['is_full'] as bool? ?? false,
      maxUses: (json['max_uses'] as num?)?.toInt(),
      expiresAt: json['expires_at']?.toString(),
      createdAt: json['created_at']?.toString(),
    );
  }

  final String id;
  final String code;
  final int currentUses;
  final bool isExpired;
  final bool isFull;
  final int? maxUses;
  final String? expiresAt;
  final String? createdAt;
}
