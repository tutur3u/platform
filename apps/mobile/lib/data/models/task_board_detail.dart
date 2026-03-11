import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';

class TaskBoardDetail extends Equatable {
  const TaskBoardDetail({
    required this.id,
    required this.wsId,
    this.name,
    this.icon,
    this.createdAt,
    this.archivedAt,
    this.deletedAt,
    this.lists = const [],
    this.tasks = const [],
    this.labels = const [],
    this.members = const [],
    this.projects = const [],
  });

  factory TaskBoardDetail.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    if (rawId is! String || rawId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardDetail.fromJson: required field "id" is missing or invalid',
      );
    }

    final rawWorkspaceId = json['ws_id'];
    if (rawWorkspaceId is! String || rawWorkspaceId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardDetail.fromJson: required field "ws_id" '
        'is missing or invalid',
      );
    }

    return TaskBoardDetail(
      id: rawId.trim(),
      wsId: rawWorkspaceId.trim(),
      name: (json['name'] as String?)?.trim(),
      icon: (json['icon'] as String?)?.trim(),
      createdAt: _parseDateTime(json['created_at']),
      archivedAt: _parseDateTime(json['archived_at']),
      deletedAt: _parseDateTime(json['deleted_at']),
    );
  }

  static DateTime? _parseDateTime(Object? value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }

  final String id;
  final String wsId;
  final String? name;
  final String? icon;
  final DateTime? createdAt;
  final DateTime? archivedAt;
  final DateTime? deletedAt;
  final List<TaskBoardList> lists;
  final List<TaskBoardTask> tasks;
  final List<TaskLabel> labels;
  final List<WorkspaceUserOption> members;
  final List<TaskProjectSummary> projects;

  TaskBoardDetail copyWith({
    String? name,
    String? icon,
    DateTime? createdAt,
    DateTime? archivedAt,
    DateTime? deletedAt,
    List<TaskBoardList>? lists,
    List<TaskBoardTask>? tasks,
    List<TaskLabel>? labels,
    List<WorkspaceUserOption>? members,
    List<TaskProjectSummary>? projects,
  }) {
    return TaskBoardDetail(
      id: id,
      wsId: wsId,
      name: name ?? this.name,
      icon: icon ?? this.icon,
      createdAt: createdAt ?? this.createdAt,
      archivedAt: archivedAt ?? this.archivedAt,
      deletedAt: deletedAt ?? this.deletedAt,
      lists: lists ?? this.lists,
      tasks: tasks ?? this.tasks,
      labels: labels ?? this.labels,
      members: members ?? this.members,
      projects: projects ?? this.projects,
    );
  }

  @override
  List<Object?> get props => [
    id,
    wsId,
    name,
    icon,
    createdAt,
    archivedAt,
    deletedAt,
    lists,
    tasks,
    labels,
    members,
    projects,
  ];
}
