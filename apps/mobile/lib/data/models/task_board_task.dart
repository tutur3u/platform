import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_relationships.dart';
import 'package:mobile/data/utils/date_utils.dart';

const Object _taskBoardTaskUnset = Object();

class TaskBoardTaskAssignee extends Equatable {
  const TaskBoardTaskAssignee({
    required this.id,
    this.displayName,
    this.email,
    this.avatarUrl,
  });

  factory TaskBoardTaskAssignee.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    if (rawId is! String || rawId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardTaskAssignee.fromJson: required field "id" '
        'is missing or invalid',
      );
    }

    return TaskBoardTaskAssignee(
      id: rawId.trim(),
      displayName: (json['display_name'] as String?)?.trim(),
      email: (json['email'] as String?)?.trim(),
      avatarUrl: (json['avatar_url'] as String?)?.trim(),
    );
  }

  final String id;
  final String? displayName;
  final String? email;
  final String? avatarUrl;

  @override
  List<Object?> get props => [id, displayName, email, avatarUrl];
}

class TaskBoardTaskLabel extends Equatable {
  const TaskBoardTaskLabel({
    required this.id,
    this.name,
    this.color,
  });

  factory TaskBoardTaskLabel.fromJson(Map<String, dynamic> json) {
    final labelJson = (json['label'] is Map<String, dynamic>)
        ? json['label'] as Map<String, dynamic>
        : json;
    final rawId = labelJson['id'];
    if (rawId is! String || rawId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardTaskLabel.fromJson: required field "id" '
        'is missing or invalid',
      );
    }

    return TaskBoardTaskLabel(
      id: rawId.trim(),
      name: (labelJson['name'] as String?)?.trim(),
      color: (labelJson['color'] as String?)?.trim(),
    );
  }

  final String id;
  final String? name;
  final String? color;

  @override
  List<Object?> get props => [id, name, color];
}

class TaskBoardTaskProject extends Equatable {
  const TaskBoardTaskProject({
    required this.id,
    this.name,
  });

  factory TaskBoardTaskProject.fromJson(Map<String, dynamic> json) {
    final projectJson = (json['project'] is Map<String, dynamic>)
        ? json['project'] as Map<String, dynamic>
        : json;
    final rawId = projectJson['id'];
    if (rawId is! String || rawId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardTaskProject.fromJson: required field "id" '
        'is missing or invalid',
      );
    }

    return TaskBoardTaskProject(
      id: rawId.trim(),
      name: (projectJson['name'] as String?)?.trim(),
    );
  }

  final String id;
  final String? name;

  @override
  List<Object?> get props => [id, name];
}

class TaskBoardTask extends Equatable {
  const TaskBoardTask({
    required this.id,
    required this.listId,
    this.displayNumber,
    this.name,
    this.description,
    this.priority,
    this.completed,
    this.startDate,
    this.endDate,
    this.createdAt,
    this.closedAt,
    this.estimationPoints,
    this.assigneeIds = const [],
    this.labelIds = const [],
    this.projectIds = const [],
    this.assignees = const [],
    this.labels = const [],
    this.projects = const [],
    this.relationships = TaskRelationshipsResponse.empty,
    this.relationshipsLoaded = false,
    this.relationshipSummary = const TaskRelationshipSummary(),
  });

  factory TaskBoardTask.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    if (rawId is! String || rawId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardTask.fromJson: required field "id" is missing or invalid',
      );
    }

    final rawListId = json['list_id'];
    if (rawListId is! String || rawListId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardTask.fromJson: required field "list_id" '
        'is missing or invalid',
      );
    }

    final assigneeIds = _parseIdList(json['assignee_ids']);
    final labelIds = _parseIdList(json['label_ids']);
    final projectIds = _parseIdList(json['project_ids']);

    final relationshipSummary = _parseRelationshipSummary(
      json['relationship_summary'],
    );

    return TaskBoardTask(
      id: rawId.trim(),
      listId: rawListId.trim(),
      displayNumber: (json['display_number'] as num?)?.toInt(),
      name: (json['name'] as String?)?.trim(),
      description: (json['description'] as String?)?.trim(),
      priority: (json['priority'] as String?)?.trim(),
      completed: json['completed'] as bool?,
      startDate: parseDateTime(json['start_date']),
      endDate: parseDateTime(json['end_date']),
      createdAt: parseDateTime(json['created_at']),
      closedAt: parseDateTime(json['closed_at']),
      estimationPoints: (json['estimation_points'] as num?)?.toInt(),
      assigneeIds: assigneeIds,
      labelIds: labelIds,
      projectIds: projectIds,
      assignees: assigneeIds
          .map((id) => TaskBoardTaskAssignee(id: id))
          .toList(growable: false),
      labels: labelIds
          .map((id) => TaskBoardTaskLabel(id: id))
          .toList(growable: false),
      projects: projectIds
          .map((id) => TaskBoardTaskProject(id: id))
          .toList(growable: false),
      relationshipSummary: relationshipSummary,
    );
  }

  TaskBoardTask copyWith({
    String? listId,
    int? displayNumber,
    String? name,
    Object? description = _taskBoardTaskUnset,
    String? priority,
    bool? completed,
    DateTime? startDate,
    DateTime? endDate,
    DateTime? createdAt,
    DateTime? closedAt,
    int? estimationPoints,
    List<String>? assigneeIds,
    List<String>? labelIds,
    List<String>? projectIds,
    List<TaskBoardTaskAssignee>? assignees,
    List<TaskBoardTaskLabel>? labels,
    List<TaskBoardTaskProject>? projects,
    TaskRelationshipsResponse? relationships,
    bool? relationshipsLoaded,
    TaskRelationshipSummary? relationshipSummary,
  }) {
    return TaskBoardTask(
      id: id,
      listId: listId ?? this.listId,
      displayNumber: displayNumber ?? this.displayNumber,
      name: name ?? this.name,
      description: identical(description, _taskBoardTaskUnset)
          ? this.description
          : description as String?,
      priority: priority ?? this.priority,
      completed: completed ?? this.completed,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      createdAt: createdAt ?? this.createdAt,
      closedAt: closedAt ?? this.closedAt,
      estimationPoints: estimationPoints ?? this.estimationPoints,
      assigneeIds: assigneeIds ?? this.assigneeIds,
      labelIds: labelIds ?? this.labelIds,
      projectIds: projectIds ?? this.projectIds,
      assignees: assignees ?? this.assignees,
      labels: labels ?? this.labels,
      projects: projects ?? this.projects,
      relationships: relationships ?? this.relationships,
      relationshipsLoaded: relationshipsLoaded ?? this.relationshipsLoaded,
      relationshipSummary: relationshipSummary ?? this.relationshipSummary,
    );
  }

  static TaskRelationshipSummary _parseRelationshipSummary(dynamic rawSummary) {
    if (rawSummary is! Map<String, dynamic>) {
      return const TaskRelationshipSummary();
    }

    return TaskRelationshipSummary.fromJson(rawSummary);
  }

  static List<String> _parseIdList(dynamic value) {
    if (value is! List<dynamic>) {
      return const [];
    }

    final uniqueIds = <String>{};
    for (final id in value.whereType<String>()) {
      final normalized = id.trim();
      if (normalized.isNotEmpty) {
        uniqueIds.add(normalized);
      }
    }

    return List.unmodifiable(uniqueIds);
  }

  final String id;
  final String listId;
  final int? displayNumber;
  final String? name;
  final String? description;
  final String? priority;
  final bool? completed;
  final DateTime? startDate;
  final DateTime? endDate;
  final DateTime? createdAt;
  final DateTime? closedAt;
  final int? estimationPoints;
  final List<String> assigneeIds;
  final List<String> labelIds;
  final List<String> projectIds;
  final List<TaskBoardTaskAssignee> assignees;
  final List<TaskBoardTaskLabel> labels;
  final List<TaskBoardTaskProject> projects;
  final TaskRelationshipsResponse relationships;
  final bool relationshipsLoaded;
  final TaskRelationshipSummary relationshipSummary;

  @override
  List<Object?> get props => [
    id,
    listId,
    displayNumber,
    name,
    description,
    priority,
    completed,
    startDate,
    endDate,
    createdAt,
    closedAt,
    estimationPoints,
    assigneeIds,
    labelIds,
    projectIds,
    assignees,
    labels,
    projects,
    relationships,
    relationshipsLoaded,
    relationshipSummary,
  ];
}

class TaskRelationshipSummary extends Equatable {
  const TaskRelationshipSummary({
    this.parentTaskId,
    this.childCount = 0,
    this.blockedByCount = 0,
    this.blockingCount = 0,
    this.relatedCount = 0,
  });

  factory TaskRelationshipSummary.fromJson(Map<String, dynamic> json) {
    final parentTaskId = (json['parent_task_id'] as String?)?.trim();
    return TaskRelationshipSummary(
      parentTaskId: parentTaskId?.isNotEmpty == true ? parentTaskId : null,
      childCount: (json['child_count'] as num?)?.toInt() ?? 0,
      blockedByCount: (json['blocked_by_count'] as num?)?.toInt() ?? 0,
      blockingCount: (json['blocking_count'] as num?)?.toInt() ?? 0,
      relatedCount: (json['related_count'] as num?)?.toInt() ?? 0,
    );
  }

  final String? parentTaskId;
  final int childCount;
  final int blockedByCount;
  final int blockingCount;
  final int relatedCount;

  bool get hasParent => parentTaskId != null;

  @override
  List<Object?> get props => [
    parentTaskId,
    childCount,
    blockedByCount,
    blockingCount,
    relatedCount,
  ];
}
