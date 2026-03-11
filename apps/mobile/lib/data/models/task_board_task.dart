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
    this.assignees = const [],
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
      assignees: rawAssignees
          .whereType<Map<String, dynamic>>()
          .map(TaskBoardTaskAssignee.fromJson)
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
  final List<TaskBoardTaskAssignee> assignees;

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
    assignees,
  ];
}
