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

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'personal': personal,
  };

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
    workspace: _parseWorkspace(json),
  );

  static TaskWorkspaceInfo? _parseWorkspace(Map<String, dynamic> json) {
    final workspace = json['workspaces'];
    if (workspace is Map<String, dynamic>) {
      return TaskWorkspaceInfo.fromJson(workspace);
    }
    final legacyWorkspace = json['workspace'];
    if (legacyWorkspace is Map<String, dynamic>) {
      return TaskWorkspaceInfo.fromJson(legacyWorkspace);
    }
    return null;
  }

  final String id;
  final String? name;
  final String? wsId;
  final TaskWorkspaceInfo? workspace;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'ws_id': wsId,
    'workspace': workspace?.toJson(),
  };

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

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'status': status,
    'board': board?.toJson(),
  };

  @override
  List<Object?> get props => [id, name, status, board];
}

/// Enriched task model mirroring the web's `TaskWithRelations`.
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

  /// Constructs a [UserTask] from the legacy RPC row.
  factory UserTask.fromRpcJson(Map<String, dynamic> json) => UserTask(
    id: json['task_id'] as String,
    name: json['task_name'] as String?,
    description: json['task_description'] as String?,
    priority: json['task_priority'] as String?,
    startDate: _parseDateTime(json['task_start_date']),
    endDate: _parseDateTime(json['task_end_date']),
    listId: json['task_list_id'] as String?,
    createdAt: _parseDateTime(json['task_created_at']),
  );

  /// Constructs a [UserTask] from the web API payload.
  factory UserTask.fromJson(Map<String, dynamic> json) => UserTask(
    id: json['id'] as String,
    name: json['name'] as String?,
    description: json['description'] as String?,
    priority: json['priority'] as String?,
    startDate: _parseDateTime(json['start_date']),
    endDate: _parseDateTime(json['end_date']),
    listId: json['list_id'] as String?,
    createdAt: _parseDateTime(json['created_at']),
    list: json['list'] is Map<String, dynamic>
        ? TaskListInfo.fromJson(json['list'] as Map<String, dynamic>)
        : null,
  );

  static DateTime? _parseDateTime(dynamic value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }

  final String id;
  final String? name;
  final String? description;

  /// One of `'critical'`, `'high'`, `'normal'`, `'low'`, or `null`.
  final String? priority;
  final DateTime? startDate;
  final DateTime? endDate;
  final String? listId;
  final DateTime? createdAt;

  /// Joined list -> board -> workspace chain.
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

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'priority': priority,
    'start_date': startDate?.toIso8601String(),
    'end_date': endDate?.toIso8601String(),
    'list_id': listId,
    'created_at': createdAt?.toIso8601String(),
    'list': list?.toJson(),
  };

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
