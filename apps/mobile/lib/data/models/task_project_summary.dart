import 'package:equatable/equatable.dart';

class TaskProjectUserSummary extends Equatable {
  const TaskProjectUserSummary({
    required this.id,
    required this.displayName,
    this.avatarUrl,
  });

  factory TaskProjectUserSummary.fromJson(Map<String, dynamic> json) {
    return TaskProjectUserSummary(
      id: json['id'] as String,
      displayName: json['display_name'] as String? ?? '',
      avatarUrl: json['avatar_url'] as String?,
    );
  }

  final String id;
  final String displayName;
  final String? avatarUrl;

  String get label {
    if (displayName.trim().isNotEmpty) return displayName.trim();
    return id;
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'display_name': displayName,
    'avatar_url': avatarUrl,
  };

  @override
  List<Object?> get props => [id, displayName, avatarUrl];
}

class TaskProjectLinkedTask extends Equatable {
  const TaskProjectLinkedTask({
    required this.id,
    required this.name,
    this.completedAt,
    this.priority,
    this.listName,
  });

  factory TaskProjectLinkedTask.fromJson(Map<String, dynamic> json) {
    return TaskProjectLinkedTask(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      completedAt: json['completed_at'] != null
          ? DateTime.tryParse(json['completed_at'] as String)
          : null,
      priority: json['priority'] as String?,
      listName: json['listName'] as String?,
    );
  }

  final String id;
  final String name;
  final DateTime? completedAt;
  final String? priority;
  final String? listName;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'completed_at': completedAt?.toIso8601String(),
    'priority': priority,
    'listName': listName,
  };

  @override
  List<Object?> get props => [id, name, completedAt, priority, listName];
}

class TaskProjectSummary extends Equatable {
  const TaskProjectSummary({
    required this.id,
    required this.name,
    required this.wsId,
    required this.creatorId,
    required this.createdAt,
    required this.tasksCount,
    required this.completedTasksCount,
    required this.linkedTasks,
    this.description,
    this.leadId,
    this.lead,
    this.status,
    this.priority,
    this.healthStatus,
    this.startDate,
    this.endDate,
    this.archived,
    this.updatedAt,
  });

  factory TaskProjectSummary.fromJson(Map<String, dynamic> json) {
    return TaskProjectSummary(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      wsId: json['ws_id'] as String? ?? '',
      creatorId: json['creator_id'] as String? ?? '',
      leadId: json['lead_id'] as String?,
      lead: json['lead'] is Map<String, dynamic>
          ? TaskProjectUserSummary.fromJson(
              json['lead'] as Map<String, dynamic>,
            )
          : null,
      status: json['status'] as String?,
      priority: json['priority'] as String?,
      healthStatus: json['health_status'] as String?,
      startDate: json['start_date'] != null
          ? DateTime.tryParse(json['start_date'] as String)
          : null,
      endDate: json['end_date'] != null
          ? DateTime.tryParse(json['end_date'] as String)
          : null,
      archived: json['archived'] as bool?,
      createdAt:
          DateTime.tryParse(json['created_at'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      updatedAt: json['updated_at'] != null
          ? DateTime.tryParse(json['updated_at'] as String)
          : null,
      tasksCount: (json['tasksCount'] as num?)?.toInt() ?? 0,
      completedTasksCount: (json['completedTasksCount'] as num?)?.toInt() ?? 0,
      linkedTasks: ((json['linkedTasks'] as List<dynamic>?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TaskProjectLinkedTask.fromJson)
          .toList(growable: false),
    );
  }

  final String id;
  final String name;
  final String? description;
  final String wsId;
  final String creatorId;
  final String? leadId;
  final TaskProjectUserSummary? lead;
  final String? status;
  final String? priority;
  final String? healthStatus;
  final DateTime? startDate;
  final DateTime? endDate;
  final bool? archived;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final int tasksCount;
  final int completedTasksCount;
  final List<TaskProjectLinkedTask> linkedTasks;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'ws_id': wsId,
    'creator_id': creatorId,
    'lead_id': leadId,
    'lead': lead?.toJson(),
    'status': status,
    'priority': priority,
    'health_status': healthStatus,
    'start_date': startDate?.toIso8601String(),
    'end_date': endDate?.toIso8601String(),
    'archived': archived,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt?.toIso8601String(),
    'tasksCount': tasksCount,
    'completedTasksCount': completedTasksCount,
    'linkedTasks': linkedTasks
        .map((task) => task.toJson())
        .toList(growable: false),
  };

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    wsId,
    creatorId,
    leadId,
    lead,
    status,
    priority,
    healthStatus,
    startDate,
    endDate,
    archived,
    createdAt,
    updatedAt,
    tasksCount,
    completedTasksCount,
    linkedTasks,
  ];
}
