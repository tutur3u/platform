import 'package:equatable/equatable.dart';

class TaskBulkOperation extends Equatable {
  const TaskBulkOperation._({
    required this.type,
    this.updates,
    this.listId,
    this.targetBoardId,
    this.labelId,
    this.projectId,
    this.assigneeId,
  });

  factory TaskBulkOperation.updateFields(Map<String, dynamic> updates) {
    return TaskBulkOperation._(type: 'update_fields', updates: updates);
  }

  factory TaskBulkOperation.moveToList({
    required String listId,
    String? targetBoardId,
  }) {
    return TaskBulkOperation._(
      type: 'move_to_list',
      listId: listId,
      targetBoardId: targetBoardId,
    );
  }

  factory TaskBulkOperation.addLabel(String labelId) {
    return TaskBulkOperation._(type: 'add_label', labelId: labelId);
  }

  factory TaskBulkOperation.removeLabel(String labelId) {
    return TaskBulkOperation._(type: 'remove_label', labelId: labelId);
  }

  factory TaskBulkOperation.addProject(String projectId) {
    return TaskBulkOperation._(type: 'add_project', projectId: projectId);
  }

  factory TaskBulkOperation.removeProject(String projectId) {
    return TaskBulkOperation._(type: 'remove_project', projectId: projectId);
  }

  factory TaskBulkOperation.addAssignee(String assigneeId) {
    return TaskBulkOperation._(type: 'add_assignee', assigneeId: assigneeId);
  }

  factory TaskBulkOperation.removeAssignee(String assigneeId) {
    return TaskBulkOperation._(
      type: 'remove_assignee',
      assigneeId: assigneeId,
    );
  }

  static const TaskBulkOperation clearLabels = TaskBulkOperation._(
    type: 'clear_labels',
  );
  static const TaskBulkOperation clearProjects = TaskBulkOperation._(
    type: 'clear_projects',
  );
  static const TaskBulkOperation clearAssignees = TaskBulkOperation._(
    type: 'clear_assignees',
  );

  final String type;
  final Map<String, dynamic>? updates;
  final String? listId;
  final String? targetBoardId;
  final String? labelId;
  final String? projectId;
  final String? assigneeId;

  Map<String, dynamic> toJson() {
    return {
      'type': type,
      if (updates != null) 'updates': updates,
      if (listId != null) 'listId': listId,
      if (targetBoardId != null) 'targetBoardId': targetBoardId,
      if (labelId != null) 'labelId': labelId,
      if (projectId != null) 'projectId': projectId,
      if (assigneeId != null) 'assigneeId': assigneeId,
    };
  }

  @override
  List<Object?> get props => [
    type,
    updates,
    listId,
    targetBoardId,
    labelId,
    projectId,
    assigneeId,
  ];
}

class TaskBulkTaskMeta extends Equatable {
  const TaskBulkTaskMeta({
    this.listId,
    this.completedAt,
    this.closedAt,
  });

  factory TaskBulkTaskMeta.fromJson(Map<String, dynamic> json) {
    return TaskBulkTaskMeta(
      listId: json['list_id'] as String?,
      completedAt: json['completed_at'] != null
          ? DateTime.tryParse(json['completed_at'] as String)?.toLocal()
          : null,
      closedAt: json['closed_at'] != null
          ? DateTime.tryParse(json['closed_at'] as String)?.toLocal()
          : null,
    );
  }

  final String? listId;
  final DateTime? completedAt;
  final DateTime? closedAt;

  @override
  List<Object?> get props => [listId, completedAt, closedAt];
}

class TaskBulkFailure extends Equatable {
  const TaskBulkFailure({required this.taskId, required this.error});

  factory TaskBulkFailure.fromJson(Map<String, dynamic> json) {
    return TaskBulkFailure(
      taskId: (json['taskId'] as String?) ?? '',
      error: (json['error'] as String?) ?? 'Unknown error',
    );
  }

  final String taskId;
  final String error;

  @override
  List<Object?> get props => [taskId, error];
}

class TaskBulkResult extends Equatable {
  const TaskBulkResult({
    required this.successCount,
    required this.failCount,
    required this.taskIds,
    required this.succeededTaskIds,
    required this.failures,
    required this.taskMetaById,
  });

  factory TaskBulkResult.fromJson(Map<String, dynamic> json) {
    final taskIds = (json['taskIds'] as List<dynamic>? ?? const [])
        .whereType<String>()
        .toList(growable: false);
    final succeededTaskIds =
        (json['succeededTaskIds'] as List<dynamic>? ?? const [])
            .whereType<String>()
            .toList(growable: false);
    final failures = (json['failures'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(TaskBulkFailure.fromJson)
        .toList(growable: false);

    final taskMetaRaw = json['taskMetaById'];
    final taskMetaById = <String, TaskBulkTaskMeta>{};
    if (taskMetaRaw is Map<String, dynamic>) {
      for (final entry in taskMetaRaw.entries) {
        final value = entry.value;
        if (value is Map<String, dynamic>) {
          taskMetaById[entry.key] = TaskBulkTaskMeta.fromJson(value);
        }
      }
    }

    return TaskBulkResult(
      successCount: (json['successCount'] as num?)?.toInt() ?? 0,
      failCount: (json['failCount'] as num?)?.toInt() ?? failures.length,
      taskIds: taskIds,
      succeededTaskIds: succeededTaskIds,
      failures: failures,
      taskMetaById: Map.unmodifiable(taskMetaById),
    );
  }

  final int successCount;
  final int failCount;
  final List<String> taskIds;
  final List<String> succeededTaskIds;
  final List<TaskBulkFailure> failures;
  final Map<String, TaskBulkTaskMeta> taskMetaById;

  bool get hasFailures => failCount > 0;

  @override
  List<Object?> get props => [
    successCount,
    failCount,
    taskIds,
    succeededTaskIds,
    failures,
    taskMetaById,
  ];
}
