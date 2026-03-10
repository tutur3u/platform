import 'package:equatable/equatable.dart';

class TaskBoardSummary extends Equatable {
  const TaskBoardSummary({
    required this.id,
    required this.wsId,
    required this.createdAt,
    this.name,
    this.icon,
    this.archivedAt,
    this.deletedAt,
    this.listCount = 0,
    this.taskCount = 0,
  });

  factory TaskBoardSummary.fromJson(Map<String, dynamic> json) {
    final taskLists = json['task_lists'] as List<dynamic>? ?? const [];
    final computedTaskCount = taskLists
        .whereType<Map<String, dynamic>>()
        .map((list) => (list['tasks'] as List<dynamic>?)?.length ?? 0)
        .fold<int>(0, (acc, count) => acc + count);

    return TaskBoardSummary(
      id: json['id'] as String,
      wsId: json['ws_id'] as String,
      name: (json['name'] as String?)?.trim().isNotEmpty == true
          ? (json['name'] as String).trim()
          : null,
      icon: json['icon'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String)
          : null,
      archivedAt: json['archived_at'] != null
          ? DateTime.tryParse(json['archived_at'] as String)
          : null,
      deletedAt: json['deleted_at'] != null
          ? DateTime.tryParse(json['deleted_at'] as String)
          : null,
      listCount: taskLists.length,
      taskCount: computedTaskCount,
    );
  }

  final String id;
  final String wsId;
  final String? name;
  final String? icon;
  final DateTime? createdAt;
  final DateTime? archivedAt;
  final DateTime? deletedAt;
  final int listCount;
  final int taskCount;

  bool get isArchived => archivedAt != null && deletedAt == null;
  bool get isRecentlyDeleted => deletedAt != null;

  @override
  List<Object?> get props => [
    id,
    wsId,
    name,
    icon,
    createdAt,
    archivedAt,
    deletedAt,
    listCount,
    taskCount,
  ];
}
