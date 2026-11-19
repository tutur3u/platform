part of 'task_list_cubit.dart';

typedef MyTaskUndo = Future<void> Function();

extension MyTaskMutations on TaskListCubit {
  Future<MyTaskUndo?> completeMyTask(UserTask task, {String? zone}) async {
    final workspaceId = _taskWorkspaceId(task);
    final list = task.list;
    final board = list?.board;
    final originalListId = list?.id ?? task.listId;
    if (workspaceId == null || originalListId == null || task.isDone) {
      return null;
    }
    TaskBoardList? destination;
    final scope = (_wsId, _userId);
    final changed = await _writeMyTask(
      taskId: task.id,
      write: () async {
        if (board != null) {
          final lists = await _repo.getBoardLists(workspaceId, board.id);
          destination = lists
              .where((list) => list.isDone && !list.archived)
              .firstOrNull;
        }
        if (isClosed || scope != (_wsId, _userId)) return task;
        final target = destination;
        if (target == null) {
          await _repo.setMyTaskCompletion(task.id, _clock());
          return UserTask.fromJson({...task.toJson(), 'completed': true});
        }
        await _repo.moveBoardTask(
          wsId: workspaceId,
          taskId: task.id,
          listId: target.id,
        );
        return task.withList(
          TaskListInfo(
            id: target.id,
            name: target.name,
            status: target.status,
            board: board,
          ),
        );
      },
      completed: true,
    );
    if (!changed) return null;
    return () async {
      if (isClosed || scope != (_wsId, _userId)) return;
      await _writeMyTask(
        taskId: task.id,
        write: () async {
          if (destination == null) {
            await _repo.setMyTaskCompletion(task.id, null);
          } else {
            await _repo.moveBoardTask(
              wsId: workspaceId,
              taskId: task.id,
              listId: originalListId,
            );
          }
          return task;
        },
        completed: false,
        zone: zone,
      );
    };
  }

  Future<void> snoozeMyTask(
    UserTask task, {
    required DateTime date,
    String? zone,
  }) async {
    final workspaceId = _taskWorkspaceId(task);
    if (workspaceId == null) return;
    await _writeMyTask(
      taskId: task.id,
      write: () async {
        await _repo.updateBoardTask(
          wsId: workspaceId,
          taskId: task.id,
          endDate: date,
        );
        return task.withDueDate(date);
      },
      completed: false,
      zone: zone,
    );
  }

  Future<void> createMyTask({
    required String name,
    required TaskBoardInfo board,
    required TaskBoardList list,
    String? priority,
    DateTime? due,
    String? zone,
  }) async {
    final workspaceId = _wsId;
    final actor = _userId;
    if (workspaceId == null || actor == null || board.wsId != workspaceId) {
      return;
    }
    await _writeMyTask(
      write: () async {
        final task = await _repo.createBoardTask(
          wsId: workspaceId,
          listId: list.id,
          name: name,
          priority: priority,
          endDate: due,
          assigneeIds: [actor],
        );
        return UserTask(
          id: task.id,
          name: task.name ?? name,
          priority: task.priority ?? priority,
          endDate: task.endDate ?? due,
          listId: list.id,
          createdAt: task.createdAt,
          list: TaskListInfo(
            id: list.id,
            name: list.name,
            status: list.status,
            board: board,
          ),
          assignees: task.assignees,
        );
      },
      completed: list.status == 'done' || list.status == 'review',
      zone: zone,
    );
  }

  String? _taskWorkspaceId(UserTask task) =>
      task.list?.board?.wsId ?? task.list?.board?.workspace?.id ?? _wsId;
}
