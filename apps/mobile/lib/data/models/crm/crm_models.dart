import 'package:equatable/equatable.dart';

String? crmAsString(Object? value) {
  if (value is String) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
  return null;
}

int crmAsInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

bool crmAsBool(Object? value) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) return value.toLowerCase() == 'true';
  return false;
}

Map<String, dynamic> crmAsMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, val) => MapEntry(key.toString(), val));
  }
  return const <String, dynamic>{};
}

class CrmUserPermissions extends Equatable {
  const CrmUserPermissions({
    required this.hasPrivateInfo,
    required this.hasPublicInfo,
    required this.canCheckUserAttendance,
  });

  factory CrmUserPermissions.fromJson(Map<String, dynamic> json) {
    return CrmUserPermissions(
      hasPrivateInfo: crmAsBool(json['hasPrivateInfo']),
      hasPublicInfo: crmAsBool(json['hasPublicInfo']),
      canCheckUserAttendance: crmAsBool(json['canCheckUserAttendance']),
    );
  }

  final bool hasPrivateInfo;
  final bool hasPublicInfo;
  final bool canCheckUserAttendance;

  @override
  List<Object?> get props => [
    hasPrivateInfo,
    hasPublicInfo,
    canCheckUserAttendance,
  ];
}

class CrmUser extends Equatable {
  const CrmUser({
    required this.id,
    required this.workspaceId,
    this.fullName,
    this.displayName,
    this.email,
    this.phone,
    this.gender,
    this.birthday,
    this.ethnicity,
    this.guardian,
    this.nationalId,
    this.address,
    this.note,
    this.avatarUrl,
    this.archived = false,
    this.archivedUntil,
    this.isGuest = false,
    this.requireAttention = false,
    this.groupCount = 0,
    this.attendanceCount = 0,
    this.linkedPromotionsCount = 0,
    this.linkedPromotionNames,
  });

  factory CrmUser.fromJson(Map<String, dynamic> json) {
    return CrmUser(
      id: crmAsString(json['id']) ?? '',
      workspaceId: crmAsString(json['ws_id']) ?? '',
      fullName: crmAsString(json['full_name']),
      displayName: crmAsString(json['display_name']),
      email: crmAsString(json['email']),
      phone: crmAsString(json['phone']),
      gender: crmAsString(json['gender']),
      birthday: crmAsString(json['birthday']),
      ethnicity: crmAsString(json['ethnicity']),
      guardian: crmAsString(json['guardian']),
      nationalId: crmAsString(json['national_id']),
      address: crmAsString(json['address']),
      note: crmAsString(json['note']),
      avatarUrl: crmAsString(json['avatar_url']),
      archived: crmAsBool(json['archived']),
      archivedUntil: crmAsString(json['archived_until']),
      isGuest: crmAsBool(json['is_guest']),
      requireAttention: crmAsBool(json['require_attention']),
      groupCount: crmAsInt(json['group_count']),
      attendanceCount: crmAsInt(json['attendance_count']),
      linkedPromotionsCount: crmAsInt(json['linked_promotions_count']),
      linkedPromotionNames: crmAsString(json['linked_promotion_names']),
    );
  }

  final String id;
  final String workspaceId;
  final String? fullName;
  final String? displayName;
  final String? email;
  final String? phone;
  final String? gender;
  final String? birthday;
  final String? ethnicity;
  final String? guardian;
  final String? nationalId;
  final String? address;
  final String? note;
  final String? avatarUrl;
  final bool archived;
  final String? archivedUntil;
  final bool isGuest;
  final bool requireAttention;
  final int groupCount;
  final int attendanceCount;
  final int linkedPromotionsCount;
  final String? linkedPromotionNames;

  String get label => displayName ?? fullName ?? email ?? phone ?? id;

  @override
  List<Object?> get props => [
    id,
    workspaceId,
    fullName,
    displayName,
    email,
    phone,
    gender,
    birthday,
    ethnicity,
    guardian,
    nationalId,
    address,
    note,
    avatarUrl,
    archived,
    archivedUntil,
    isGuest,
    requireAttention,
    groupCount,
    attendanceCount,
    linkedPromotionsCount,
    linkedPromotionNames,
  ];
}

class CrmUsersResult extends Equatable {
  const CrmUsersResult({
    required this.users,
    required this.count,
    this.permissions,
  });

  factory CrmUsersResult.fromJson(Map<String, dynamic> json) {
    return CrmUsersResult(
      users: (json['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CrmUser.fromJson)
          .toList(growable: false),
      count: crmAsInt(json['count']),
      permissions: json['permissions'] is Map<String, dynamic>
          ? CrmUserPermissions.fromJson(
              json['permissions'] as Map<String, dynamic>,
            )
          : null,
    );
  }

  final List<CrmUser> users;
  final int count;
  final CrmUserPermissions? permissions;

  @override
  List<Object?> get props => [users, count, permissions];
}

class CrmGroup extends Equatable {
  const CrmGroup({
    required this.id,
    required this.name,
  });

  factory CrmGroup.fromJson(Map<String, dynamic> json) {
    return CrmGroup(
      id: crmAsString(json['id']) ?? '',
      name: crmAsString(json['name']) ?? 'Unnamed group',
    );
  }

  final String id;
  final String name;

  @override
  List<Object?> get props => [id, name];
}

class CrmFeedbackActor extends Equatable {
  const CrmFeedbackActor({
    required this.id,
    this.fullName,
    this.displayName,
    this.email,
  });

  factory CrmFeedbackActor.fromJson(Map<String, dynamic> json) {
    return CrmFeedbackActor(
      id: crmAsString(json['id']) ?? '',
      fullName: crmAsString(json['full_name']),
      displayName: crmAsString(json['display_name']),
      email: crmAsString(json['email']),
    );
  }

  final String id;
  final String? fullName;
  final String? displayName;
  final String? email;

  String get label => displayName ?? fullName ?? email ?? id;

  @override
  List<Object?> get props => [id, fullName, displayName, email];
}

class CrmFeedback extends Equatable {
  const CrmFeedback({
    required this.id,
    required this.userId,
    required this.groupId,
    required this.content,
    required this.requireAttention,
    required this.createdAt,
    this.creatorId,
    this.user,
    this.creator,
    this.group,
    this.userName,
    this.creatorName,
    this.groupName,
  });

  factory CrmFeedback.fromJson(Map<String, dynamic> json) {
    final userJson = crmAsMap(json['user']);
    final creatorJson = crmAsMap(json['creator']);
    final groupJson = crmAsMap(json['group']);

    return CrmFeedback(
      id: crmAsString(json['id']) ?? '',
      userId: crmAsString(json['user_id']) ?? '',
      groupId: crmAsString(json['group_id']) ?? '',
      creatorId: crmAsString(json['creator_id']),
      content: crmAsString(json['content']) ?? '',
      requireAttention: crmAsBool(json['require_attention']),
      createdAt: crmAsString(json['created_at']) ?? '',
      user: userJson.isEmpty ? null : CrmFeedbackActor.fromJson(userJson),
      creator: creatorJson.isEmpty
          ? null
          : CrmFeedbackActor.fromJson(creatorJson),
      group: groupJson.isEmpty ? null : CrmGroup.fromJson(groupJson),
      userName: crmAsString(json['user_name']),
      creatorName: crmAsString(json['creator_name']),
      groupName: crmAsString(json['group_name']),
    );
  }

  final String id;
  final String userId;
  final String groupId;
  final String? creatorId;
  final String content;
  final bool requireAttention;
  final String createdAt;
  final CrmFeedbackActor? user;
  final CrmFeedbackActor? creator;
  final CrmGroup? group;
  final String? userName;
  final String? creatorName;
  final String? groupName;

  @override
  List<Object?> get props => [
    id,
    userId,
    groupId,
    creatorId,
    content,
    requireAttention,
    createdAt,
    user,
    creator,
    group,
    userName,
    creatorName,
    groupName,
  ];
}

class CrmFeedbackResult extends Equatable {
  const CrmFeedbackResult({
    required this.items,
    required this.count,
    required this.page,
    required this.pageSize,
    required this.totalPages,
  });

  factory CrmFeedbackResult.fromJson(Map<String, dynamic> json) {
    return CrmFeedbackResult(
      items: (json['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CrmFeedback.fromJson)
          .toList(growable: false),
      count: crmAsInt(json['count']),
      page: crmAsInt(json['page']),
      pageSize: crmAsInt(json['pageSize']),
      totalPages: crmAsInt(json['totalPages']),
    );
  }

  final List<CrmFeedback> items;
  final int count;
  final int page;
  final int pageSize;
  final int totalPages;

  @override
  List<Object?> get props => [items, count, page, pageSize, totalPages];
}

class CrmAuditActor extends Equatable {
  const CrmAuditActor({
    this.authUid,
    this.workspaceUserId,
    this.id,
    this.name,
    this.email,
  });

  factory CrmAuditActor.fromJson(Map<String, dynamic> json) {
    return CrmAuditActor(
      authUid: crmAsString(json['authUid']),
      workspaceUserId: crmAsString(json['workspaceUserId']),
      id: crmAsString(json['id']),
      name: crmAsString(json['name']),
      email: crmAsString(json['email']),
    );
  }

  final String? authUid;
  final String? workspaceUserId;
  final String? id;
  final String? name;
  final String? email;

  String get label => name ?? email ?? id ?? 'System';

  @override
  List<Object?> get props => [authUid, workspaceUserId, id, name, email];
}

class CrmAuditAffectedUser extends Equatable {
  const CrmAuditAffectedUser({
    required this.id,
    this.name,
    this.email,
  });

  factory CrmAuditAffectedUser.fromJson(Map<String, dynamic> json) {
    return CrmAuditAffectedUser(
      id: crmAsString(json['id']) ?? '',
      name: crmAsString(json['name']),
      email: crmAsString(json['email']),
    );
  }

  final String id;
  final String? name;
  final String? email;

  String get label => name ?? email ?? id;

  @override
  List<Object?> get props => [id, name, email];
}

class CrmAuditFieldChange extends Equatable {
  const CrmAuditFieldChange({
    required this.field,
    required this.label,
    this.before,
    this.after,
  });

  factory CrmAuditFieldChange.fromJson(Map<String, dynamic> json) {
    return CrmAuditFieldChange(
      field: crmAsString(json['field']) ?? '',
      label: crmAsString(json['label']) ?? crmAsString(json['field']) ?? '',
      before: json['before']?.toString(),
      after: json['after']?.toString(),
    );
  }

  final String field;
  final String label;
  final String? before;
  final String? after;

  @override
  List<Object?> get props => [field, label, before, after];
}

class CrmAuditEvent extends Equatable {
  const CrmAuditEvent({
    required this.auditRecordId,
    required this.eventKind,
    required this.summary,
    required this.changedFields,
    required this.fieldChanges,
    required this.affectedUser,
    required this.actor,
    required this.occurredAt,
    required this.source,
  });

  factory CrmAuditEvent.fromJson(Map<String, dynamic> json) {
    return CrmAuditEvent(
      auditRecordId: crmAsInt(json['auditRecordId']),
      eventKind: crmAsString(json['eventKind']) ?? 'updated',
      summary: crmAsString(json['summary']) ?? '',
      changedFields:
          (json['changedFields'] as List<dynamic>? ?? const <dynamic>[])
              .map((value) => value.toString())
              .toList(growable: false),
      fieldChanges:
          (json['fieldChanges'] as List<dynamic>? ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(CrmAuditFieldChange.fromJson)
              .toList(growable: false),
      affectedUser: CrmAuditAffectedUser.fromJson(
        crmAsMap(json['affectedUser']),
      ),
      actor: CrmAuditActor.fromJson(crmAsMap(json['actor'])),
      occurredAt: crmAsString(json['occurredAt']) ?? '',
      source: crmAsString(json['source']) ?? 'live',
    );
  }

  final int auditRecordId;
  final String eventKind;
  final String summary;
  final List<String> changedFields;
  final List<CrmAuditFieldChange> fieldChanges;
  final CrmAuditAffectedUser affectedUser;
  final CrmAuditActor actor;
  final String occurredAt;
  final String source;

  @override
  List<Object?> get props => [
    auditRecordId,
    eventKind,
    summary,
    changedFields,
    fieldChanges,
    affectedUser,
    actor,
    occurredAt,
    source,
  ];
}

class CrmAuditResult extends Equatable {
  const CrmAuditResult({
    required this.items,
    required this.count,
  });

  factory CrmAuditResult.fromJson(Map<String, dynamic> json) {
    return CrmAuditResult(
      items: (json['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CrmAuditEvent.fromJson)
          .toList(growable: false),
      count: crmAsInt(json['count']),
    );
  }

  final List<CrmAuditEvent> items;
  final int count;

  @override
  List<Object?> get props => [items, count];
}

class CrmDuplicateUser extends Equatable {
  const CrmDuplicateUser({
    required this.id,
    required this.isLinked,
    this.fullName,
    this.email,
    this.phone,
    this.linkedPlatformUserId,
    this.createdAt,
  });

  factory CrmDuplicateUser.fromJson(Map<String, dynamic> json) {
    return CrmDuplicateUser(
      id: crmAsString(json['id']) ?? '',
      fullName: crmAsString(json['fullName']),
      email: crmAsString(json['email']),
      phone: crmAsString(json['phone']),
      isLinked: crmAsBool(json['isLinked']),
      linkedPlatformUserId: crmAsString(json['linkedPlatformUserId']),
      createdAt: crmAsString(json['createdAt']),
    );
  }

  final String id;
  final String? fullName;
  final String? email;
  final String? phone;
  final bool isLinked;
  final String? linkedPlatformUserId;
  final String? createdAt;

  String get label => fullName ?? email ?? phone ?? id;

  @override
  List<Object?> get props => [
    id,
    fullName,
    email,
    phone,
    isLinked,
    linkedPlatformUserId,
    createdAt,
  ];
}

class CrmDuplicateCluster extends Equatable {
  const CrmDuplicateCluster({
    required this.clusterId,
    required this.matchReason,
    required this.users,
    required this.suggestedTargetId,
  });

  factory CrmDuplicateCluster.fromJson(Map<String, dynamic> json) {
    return CrmDuplicateCluster(
      clusterId: crmAsInt(json['clusterId']),
      matchReason: crmAsString(json['matchReason']) ?? 'email',
      users: (json['users'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CrmDuplicateUser.fromJson)
          .toList(growable: false),
      suggestedTargetId: crmAsString(json['suggestedTargetId']) ?? '',
    );
  }

  final int clusterId;
  final String matchReason;
  final List<CrmDuplicateUser> users;
  final String suggestedTargetId;

  @override
  List<Object?> get props => [
    clusterId,
    matchReason,
    users,
    suggestedTargetId,
  ];
}

class CrmDuplicateDetectionResult extends Equatable {
  const CrmDuplicateDetectionResult({
    required this.clusters,
    required this.totalDuplicates,
  });

  factory CrmDuplicateDetectionResult.fromJson(Map<String, dynamic> json) {
    return CrmDuplicateDetectionResult(
      clusters: (json['clusters'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CrmDuplicateCluster.fromJson)
          .toList(growable: false),
      totalDuplicates: crmAsInt(json['totalDuplicates']),
    );
  }

  final List<CrmDuplicateCluster> clusters;
  final int totalDuplicates;

  @override
  List<Object?> get props => [clusters, totalDuplicates];
}

class CrmMergeResult extends Equatable {
  const CrmMergeResult({
    required this.success,
    required this.message,
  });

  factory CrmMergeResult.fromJson(Map<String, dynamic> json) {
    final message = crmAsString(json['message']) ?? 'success';
    return CrmMergeResult(
      success: crmAsBool(json['success']) || message == 'success',
      message: message,
    );
  }

  final bool success;
  final String message;

  @override
  List<Object?> get props => [success, message];
}
