import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_board_task.dart';

/// Fields the revert route restores, in web's order.
enum TaskRevertField {
  name('name'),
  description('description'),
  priority('priority'),
  startDate('start_date'),
  endDate('end_date'),
  estimationPoints('estimation_points'),
  listId('list_id'),
  completed('completed'),
  assignees('assignees'),
  labels('labels'),
  projects('projects');

  const TaskRevertField(this.wire);

  /// The name the revert route takes.
  final String wire;
}

/// A named entity in a snapshot (assignee, label or project).
class TaskSnapshotEntity extends Equatable {
  const TaskSnapshotEntity({required this.id, this.name});

  final String id;
  final String? name;

  @override
  List<Object?> get props => [id, name];
}

/// The task as it was just before a history entry, from the snapshot route.
class TaskSnapshot extends Equatable {
  const TaskSnapshot({
    this.name,
    this.description,
    this.priority,
    this.startDate,
    this.endDate,
    this.estimationPoints,
    this.listId,
    this.listName,
    this.completed = false,
    this.assignees = const [],
    this.labels = const [],
    this.projects = const [],
  });

  factory TaskSnapshot.fromJson(Map<String, dynamic> json) {
    List<TaskSnapshotEntity> entities(Object? value, {bool user = false}) => [
      for (final row in value is List ? value : const [])
        if (row is Map)
          if (user ? row['user_id'] ?? row['id'] : row['id'] case final id?)
            TaskSnapshotEntity(
              id: id.toString(),
              name: (row['display_name'] ?? row['name'])?.toString(),
            ),
    ];
    DateTime? date(Object? value) =>
        value is String ? DateTime.tryParse(value) : null;
    return TaskSnapshot(
      name: json['name']?.toString(),
      description: json['description'],
      priority: json['priority']?.toString(),
      startDate: date(json['start_date']),
      endDate: date(json['end_date']),
      estimationPoints: (json['estimation_points'] as num?)?.toInt(),
      listId: json['list_id']?.toString(),
      listName: json['list_name']?.toString(),
      completed: json['completed'] == true,
      assignees: entities(json['assignees'], user: true),
      labels: entities(json['labels']),
      projects: entities(json['projects']),
    );
  }

  final String? name;

  /// Rich-text JSON, a JSON string, or null.
  final Object? description;
  final String? priority;
  final DateTime? startDate;
  final DateTime? endDate;
  final int? estimationPoints;
  final String? listId;
  final String? listName;
  final bool completed;
  final List<TaskSnapshotEntity> assignees;
  final List<TaskSnapshotEntity> labels;
  final List<TaskSnapshotEntity> projects;

  /// The fields where [task] now differs from this snapshot, which a
  /// revert would change.
  List<TaskRevertField> changedFrom(TaskBoardTask task) {
    bool sameIds(List<TaskSnapshotEntity> entities, List<String> ids) =>
        entities.map((entity) => entity.id).toSet().containsAll(ids) &&
        ids.toSet().length ==
            entities.map((entity) => entity.id).toSet().length;
    bool sameDate(DateTime? a, DateTime? b) =>
        a == null ? b == null : b != null && a.isAtSameMomentAs(b);
    final completedNow = task.completed ?? task.completedAt != null;
    return [
      if ((name ?? '').trim() != (task.name ?? '').trim()) TaskRevertField.name,
      if (!_sameDescription(description, task.description))
        TaskRevertField.description,
      if ((priority ?? '') != (task.priority ?? '')) TaskRevertField.priority,
      if (!sameDate(startDate, task.startDate)) TaskRevertField.startDate,
      if (!sameDate(endDate, task.endDate)) TaskRevertField.endDate,
      if (estimationPoints != task.estimationPoints)
        TaskRevertField.estimationPoints,
      if (listId != null && listId != task.listId) TaskRevertField.listId,
      if (completed != completedNow) TaskRevertField.completed,
      if (!sameIds(assignees, task.assigneeIds)) TaskRevertField.assignees,
      if (!sameIds(labels, task.labelIds)) TaskRevertField.labels,
      if (!sameIds(projects, task.projectIds)) TaskRevertField.projects,
    ];
  }

  @override
  List<Object?> get props => [
    name,
    description,
    priority,
    startDate,
    endDate,
    estimationPoints,
    listId,
    listName,
    completed,
    assignees,
    labels,
    projects,
  ];
}

/// Descriptions compare as JSON documents, whichever form each side has.
bool _sameDescription(Object? snapshot, String? current) {
  Object? decode(Object? value) {
    if (value is! String) return value;
    final text = value.trim();
    if (text.isEmpty) return null;
    try {
      return jsonDecode(text);
    } on FormatException {
      return text;
    }
  }

  return _jsonEquals(decode(snapshot), decode(current));
}

bool _jsonEquals(Object? a, Object? b) {
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final key in a.keys) {
      if (!b.containsKey(key) || !_jsonEquals(a[key], b[key])) return false;
    }
    return true;
  }
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var index = 0; index < a.length; index++) {
      if (!_jsonEquals(a[index], b[index])) return false;
    }
    return true;
  }
  return a == b;
}
