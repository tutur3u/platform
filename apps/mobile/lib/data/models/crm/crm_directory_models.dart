part of 'crm_models.dart';

class CrmSession extends Equatable {
  const CrmSession({
    required this.id,
    required this.groupId,
    required this.startsAt,
    required this.endsAt,
    this.groupName,
    this.title,
    this.status = 'scheduled',
  });

  factory CrmSession.fromJson(Map<String, dynamic> json) {
    return CrmSession(
      id: crmAsString(json['id']) ?? '',
      groupId: crmAsString(json['groupId']) ?? '',
      groupName: crmAsString(json['groupName']),
      title: crmAsString(json['title']),
      startsAt: crmAsString(json['startsAt']) ?? '',
      endsAt: crmAsString(json['endsAt']) ?? '',
      status: crmAsString(json['status']) ?? 'scheduled',
    );
  }

  final String id;
  final String groupId;
  final String? groupName;
  final String? title;
  final String startsAt;
  final String endsAt;
  final String status;

  String get label {
    final name = title?.trim();
    if (name != null && name.isNotEmpty) return name;
    return groupName ?? id;
  }

  @override
  List<Object?> get props => [
    id,
    groupId,
    groupName,
    title,
    startsAt,
    endsAt,
    status,
  ];
}

class CrmAttendanceMark extends Equatable {
  const CrmAttendanceMark({
    required this.userId,
    required this.status,
    this.sessionId,
  });

  factory CrmAttendanceMark.fromJson(Map<String, dynamic> json) {
    return CrmAttendanceMark(
      userId: crmAsString(json['user_id']) ?? '',
      status: crmAsString(json['status']) ?? 'NONE',
      sessionId: crmAsString(json['session_id']),
    );
  }

  final String userId;
  final String status;
  final String? sessionId;

  @override
  List<Object?> get props => [userId, status, sessionId];
}

class CrmGroupMember extends Equatable {
  const CrmGroupMember({required this.id, this.displayName, this.fullName});

  factory CrmGroupMember.fromJson(Map<String, dynamic> json) {
    return CrmGroupMember(
      id: crmAsString(json['id']) ?? '',
      displayName: crmAsString(json['display_name']),
      fullName: crmAsString(json['full_name']),
    );
  }

  final String id;
  final String? displayName;
  final String? fullName;

  String get label {
    final display = displayName?.trim();
    if (display != null && display.isNotEmpty) return display;
    final full = fullName?.trim();
    if (full != null && full.isNotEmpty) return full;
    return id;
  }

  @override
  List<Object?> get props => [id, displayName, fullName];
}

class CrmGroup extends Equatable {
  const CrmGroup({
    required this.id,
    required this.name,
    this.notes,
    this.startingDate,
    this.endingDate,
    this.isGuest = false,
    this.archived = false,
  });

  factory CrmGroup.fromJson(Map<String, dynamic> json) {
    return CrmGroup(
      id: crmAsString(json['id']) ?? '',
      name: crmAsString(json['name']) ?? 'Unnamed group',
      notes: crmAsString(json['notes']),
      startingDate: crmAsString(json['starting_date']),
      endingDate: crmAsString(json['ending_date']),
      isGuest: crmAsBool(json['is_guest']),
      archived: crmAsBool(json['archived']),
    );
  }

  final String id;
  final String name;
  final String? notes;
  final String? startingDate;
  final String? endingDate;
  final bool isGuest;
  final bool archived;

  @override
  List<Object?> get props => [
    id,
    name,
    notes,
    startingDate,
    endingDate,
    isGuest,
    archived,
  ];
}

class CrmGroupTag extends Equatable {
  const CrmGroupTag({
    required this.id,
    required this.name,
    this.color,
    this.groupIds = const <String>[],
  });

  factory CrmGroupTag.fromJson(Map<String, dynamic> json) {
    final raw = json['group_ids'];
    final ids = <String>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) {
          final id = crmAsString(item['group_id'] ?? item['id']);
          if (id != null) ids.add(id);
        } else {
          final id = crmAsString(item);
          if (id != null) ids.add(id);
        }
      }
    }
    return CrmGroupTag(
      id: crmAsString(json['id']) ?? '',
      name: crmAsString(json['name']) ?? '',
      color: crmAsString(json['color']),
      groupIds: ids,
    );
  }

  final String id;
  final String name;
  final String? color;
  final List<String> groupIds;

  @override
  List<Object?> get props => [id, name, color, groupIds];
}
