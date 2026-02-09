import 'package:equatable/equatable.dart';

/// Workspace info nested inside a board.
class TaskWorkspaceInfo extends Equatable {
  const TaskWorkspaceInfo({required this.id, this.name, this.personal});

  factory TaskWorkspaceInfo.fromJson(Map<String, dynamic> json) =>
      TaskWorkspaceInfo(
        id: json['id'] as String,
        name: json['name'] as String?,
        personal: json['personal'] as bool?,
      );

  final String id;
  final String? name;
  final bool? personal;

  @override
  List<Object?> get props => [id, name, personal];
}

/// Board info nested inside a task list.
class TaskBoardInfo extends Equatable {
  const TaskBoardInfo({required this.id, this.name, this.wsId, this.workspace});

  factory TaskBoardInfo.fromJson(Map<String, dynamic> json) => TaskBoardInfo(
    id: json['id'] as String,
    name: json['name'] as String?,
    wsId: json['ws_id'] as String?,
    workspace: json['workspaces'] != null
        ? TaskWorkspaceInfo.fromJson(json['workspaces'] as Map<String, dynamic>)
        : null,
  );

  final String id;
  final String? name;
  final String? wsId;
  final TaskWorkspaceInfo? workspace;

  @override
  List<Object?> get props => [id, name, wsId, workspace];
}

/// Task list info with nested board data.
class TaskListInfo extends Equatable {
  const TaskListInfo({required this.id, this.name, this.status, this.board});

  factory TaskListInfo.fromJson(Map<String, dynamic> json) => TaskListInfo(
    id: json['id'] as String,
    name: json['name'] as String?,
    status: json['status'] as String?,
    board: json['board'] != null
        ? TaskBoardInfo.fromJson(json['board'] as Map<String, dynamic>)
        : null,
  );

  final String id;
  final String? name;

  /// One of `'not_started'`, `'active'`, `'done'`.
  final String? status;
  final TaskBoardInfo? board;

  @override
  List<Object?> get props => [id, name, status, board];
}

/// Enriched task model mirroring the web's `TaskWithRelations`.
///
/// Built from the `get_user_accessible_tasks` RPC joined with list/board data.
class UserTask extends Equatable {
  const UserTask({
    required this.id,
    this.name,
    this.description,
    this.priority,
    this.startDate,
    this.endDate,
    this.listId,
    this.createdAt,
    this.list,
  });

  /// Constructs a [UserTask] from the RPC row (fields prefixed with `task_`).
  factory UserTask.fromRpcJson(Map<String, dynamic> json) => UserTask(
    id: json['task_id'] as String,
    name: json['task_name'] as String?,
    description: json['task_description'] as String?,
    priority: json['task_priority'] as String?,
    startDate: json['task_start_date'] != null
        ? DateTime.parse(json['task_start_date'] as String)
        : null,
    endDate: json['task_end_date'] != null
        ? DateTime.parse(json['task_end_date'] as String)
        : null,
    listId: json['task_list_id'] as String?,
    createdAt: json['task_created_at'] != null
        ? DateTime.parse(json['task_created_at'] as String)
        : null,
  );

  final String id;
  final String? name;
  final String? description;

  /// One of `'critical'`, `'high'`, `'normal'`, `'low'`, or `null`.
  final String? priority;
  final DateTime? startDate;
  final DateTime? endDate;
  final String? listId;
  final DateTime? createdAt;

  /// Joined list → board → workspace chain.
  final TaskListInfo? list;

  /// Whether the task is in a "done" list.
  bool get isDone => list?.status == 'done';

  /// Returns a copy with the [list] field set.
  UserTask withList(TaskListInfo? listInfo) => UserTask(
    id: id,
    name: name,
    description: description,
    priority: priority,
    startDate: startDate,
    endDate: endDate,
    listId: listId,
    createdAt: createdAt,
    list: listInfo,
  );

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    priority,
    startDate,
    endDate,
    listId,
    createdAt,
    list,
  ];
}
