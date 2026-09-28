part of 'task_repository.dart';

Future<List<Map<String, dynamic>>> _overlayTaskRows(
  String wsId,
  List<dynamic> source, {
  String? listId,
  bool deletedOnly = false,
  bool includeCreates = true,
  int offset = 0,
}) async => overlayPendingCollection(
  workspaceId: wsId,
  feature: 'tasks',
  pathContains: '/api/v1/workspaces/$wsId/tasks',
  source: source.whereType<Map<String, dynamic>>().toList(growable: false),
  pending: await OfflineMutationQueue.instance.listPending(),
  includeCreates: offset == 0 && includeCreates && !deletedOnly,
  normalizeCreate: (payload) => {
    ...payload,
    if (payload['listId'] != null) 'list_id': payload['listId'],
  },
  matchesQuery: (row) =>
      (listId == null || row['list_id'] == listId) &&
      (deletedOnly ? row['deleted'] == true : row['deleted'] != true),
);

String _encodeQueryParameters(Map<String, String> params) {
  return Uri(queryParameters: params).query;
}

DateTime _startOfDay(DateTime date) {
  return DateTime(date.year, date.month, date.day);
}

DateTime _endOfDay(DateTime date) {
  return DateTime(date.year, date.month, date.day, 23, 59, 59, 999);
}

String _taskStartDateIso(DateTime date) {
  return _startOfDay(date).toUtc().toIso8601String();
}

String _taskEndDateIso(DateTime date) {
  return _endOfDay(date).toUtc().toIso8601String();
}

Task _taskFromApiJson(Map<String, dynamic> json) {
  final priority = switch (json['priority']) {
    'low' => 1,
    'normal' => 2,
    'high' => 3,
    'critical' => 4,
    final int value => value,
    final num value => value.toInt(),
    _ => null,
  };

  return Task(
    id: json['id'] as String,
    name: json['name'] as String?,
    description: json['description'] as String?,
    priority: priority,
    completed: json['completed'] as bool?,
    startDate: json['start_date'] != null
        ? DateTime.tryParse(json['start_date'] as String)?.toLocal()
        : null,
    endDate: json['end_date'] != null
        ? DateTime.tryParse(json['end_date'] as String)?.toLocal()
        : null,
    boardId: json['board_id'] as String?,
    listId: json['list_id'] as String?,
    createdAt: json['created_at'] != null
        ? DateTime.tryParse(json['created_at'] as String)?.toLocal()
        : null,
  );
}

String? _priorityToApiValue(Object? value) {
  return switch (value) {
    'low' => 'low',
    'normal' => 'normal',
    'high' => 'high',
    'critical' => 'critical',
    1 => 'low',
    2 => 'normal',
    3 => 'high',
    4 => 'critical',
    final num number when number.toInt() >= 1 && number.toInt() <= 4 =>
      _priorityToApiValue(number.toInt()),
    _ => null,
  };
}

Map<String, dynamic> _normalizeTaskPayload(Map<String, dynamic> data) {
  return {
    if (data['name'] != null) 'name': data['name'],
    if (data.containsKey('description')) 'description': data['description'],
    if (_priorityToApiValue(data['priority']) != null)
      'priority': _priorityToApiValue(data['priority']),
    if (data['start_date'] != null) 'start_date': data['start_date'],
    if (data['startDate'] != null) 'start_date': data['startDate'],
    if (data['end_date'] != null) 'end_date': data['end_date'],
    if (data['endDate'] != null) 'end_date': data['endDate'],
    if (data['list_id'] != null) 'list_id': data['list_id'],
    if (data['listId'] != null) 'list_id': data['listId'],
    if (data['completed'] != null) 'completed': data['completed'],
    if (data['deleted'] != null) 'deleted': data['deleted'],
  };
}

List<TaskBoardTask> _hydrateTaskRelations({
  required List<TaskBoardTask> tasks,
  required List<WorkspaceUserOption> members,
  required List<TaskLabel> labels,
  required List<TaskProjectSummary> projects,
}) {
  final membersById = {for (final member in members) member.id: member};
  final labelsById = {for (final label in labels) label.id: label};
  final projectsById = {for (final project in projects) project.id: project};

  return tasks
      .map((task) {
        final hydratedAssignees = task.assigneeIds
            .map((id) => membersById[id])
            .whereType<WorkspaceUserOption>()
            .map(
              (member) => TaskBoardTaskAssignee(
                id: member.id,
                displayName: member.displayName,
                email: member.email,
                avatarUrl: member.avatarUrl,
              ),
            )
            .toList(growable: false);

        final hydratedLabels = task.labelIds
            .map((id) => labelsById[id])
            .whereType<TaskLabel>()
            .map(
              (label) => TaskBoardTaskLabel(
                id: label.id,
                name: label.name,
                color: normalizeTaskLabelColor(label.color),
              ),
            )
            .toList(growable: false);

        final hydratedProjects = task.projectIds
            .map((id) => projectsById[id])
            .whereType<TaskProjectSummary>()
            .map(
              (project) =>
                  TaskBoardTaskProject(id: project.id, name: project.name),
            )
            .toList(growable: false);

        return task.copyWith(
          assignees: hydratedAssignees,
          labels: hydratedLabels,
          projects: hydratedProjects,
        );
      })
      .toList(growable: false);
}

Future<TaskBoardDetail> _getTaskBoardMetadata(
  TaskRepository repository,
  String wsId,
  String boardId,
) async {
  try {
    final response = await repository._read(
      wsId,
      'boardDetail',
      '/api/v1/workspaces/$wsId/task-boards/$boardId',
    );
    final board = response['board'];
    if (board is! Map<String, dynamic>) {
      throw const ApiException(message: 'Board not found', statusCode: 404);
    }

    return TaskBoardDetail.fromJson(board);
  } on ApiException catch (error) {
    if (error.statusCode != 404) {
      rethrow;
    }
  }

  var page = 1;
  const maxPages = 50;

  while (true) {
    if (page > maxPages) {
      throw const ApiException(
        message: 'Board search pagination limit exceeded',
        statusCode: 500,
      );
    }

    final boardsPage = await repository.getTaskBoards(
      wsId,
      page: page,
      pageSize: 200,
    );

    TaskBoardSummary? targetBoard;
    for (final board in boardsPage.boards) {
      if (board.id == boardId) {
        targetBoard = board;
        break;
      }
    }

    if (targetBoard != null) {
      return TaskBoardDetail(
        id: targetBoard.id,
        wsId: targetBoard.wsId,
        name: targetBoard.name,
        icon: targetBoard.icon,
        ticketPrefix: targetBoard.ticketPrefix,
        createdAt: targetBoard.createdAt,
        archivedAt: targetBoard.archivedAt,
        deletedAt: targetBoard.deletedAt,
      );
    }

    final loadedCount = page * boardsPage.pageSize;
    if (boardsPage.boards.isEmpty || loadedCount >= boardsPage.totalCount) {
      break;
    }

    page += 1;
  }

  throw const ApiException(message: 'Board not found', statusCode: 404);
}
