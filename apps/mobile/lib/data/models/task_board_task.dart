import 'package:equatable/equatable.dart';

class TaskBoardTaskAssignee extends Equatable {
  const TaskBoardTaskAssignee({
    required this.id,
    this.displayName,
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
      avatarUrl: (json['avatar_url'] as String?)?.trim(),
    );
  }

  final String id;
  final String? displayName;
  final String? avatarUrl;

  @override
  List<Object?> get props => [id, displayName, avatarUrl];
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
    this.name,
    this.description,
    this.priority,
    this.completed,
    this.startDate,
    this.endDate,
    this.createdAt,
    this.closedAt,
    this.estimationPoints,
    this.assignees = const [],
    this.labels = const [],
    this.projects = const [],
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

    final rawAssignees = json['assignees'] as List<dynamic>? ?? const [];
    final rawLabels = json['labels'] as List<dynamic>? ?? const [];
    final rawProjects = json['projects'] as List<dynamic>? ?? const [];

    return TaskBoardTask(
      id: rawId.trim(),
      listId: rawListId.trim(),
      name: (json['name'] as String?)?.trim(),
      description: (json['description'] as String?)?.trim(),
      priority: (json['priority'] as String?)?.trim(),
      completed: json['completed'] as bool?,
      startDate: _parseDateTime(json['start_date']),
      endDate: _parseDateTime(json['end_date']),
      createdAt: _parseDateTime(json['created_at']),
      closedAt: _parseDateTime(json['closed_at']),
      estimationPoints: (json['estimation_points'] as num?)?.toInt(),
      assignees: rawAssignees
          .whereType<Map<String, dynamic>>()
          .map(TaskBoardTaskAssignee.fromJson)
          .toList(growable: false),
      labels: rawLabels
          .whereType<Map<String, dynamic>>()
          .map(TaskBoardTaskLabel.fromJson)
          .toList(growable: false),
      projects: rawProjects
          .whereType<Map<String, dynamic>>()
          .map(TaskBoardTaskProject.fromJson)
          .toList(growable: false),
    );
  }

  static DateTime? _parseDateTime(Object? value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }

  final String id;
  final String listId;
  final String? name;
  final String? description;
  final String? priority;
  final bool? completed;
  final DateTime? startDate;
  final DateTime? endDate;
  final DateTime? createdAt;
  final DateTime? closedAt;
  final int? estimationPoints;
  final List<TaskBoardTaskAssignee> assignees;
  final List<TaskBoardTaskLabel> labels;
  final List<TaskBoardTaskProject> projects;

  @override
  List<Object?> get props => [
    id,
    listId,
    name,
    description,
    priority,
    completed,
    startDate,
    endDate,
    createdAt,
    closedAt,
    estimationPoints,
    assignees,
    labels,
    projects,
  ];
}
