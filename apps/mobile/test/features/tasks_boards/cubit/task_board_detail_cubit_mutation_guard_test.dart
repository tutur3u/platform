import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockTaskRepository extends Mock implements TaskRepository {}

void main() {
  late _MockTaskRepository repository;
  late TaskBoardDetailCubit cubit;
  late Completer<TaskBoardTask> pendingUpdate;

  const boardDetail = TaskBoardDetail(
    id: 'board-1',
    wsId: 'ws-1',
    lists: [
      TaskBoardList(id: 'list-1', boardId: 'board-1', status: 'active'),
      TaskBoardList(id: 'list-2', boardId: 'board-1', status: 'done'),
    ],
    tasks: [
      TaskBoardTask(
        id: 'task-1',
        listId: 'list-1',
        name: 'Task',
        priority: 'low',
      ),
    ],
  );

  TaskBoardTask task() => [
    ...cubit.state.board!.tasks,
    ...cubit.state.listTasksByListId.values.expand((tasks) => tasks),
  ].firstWhere((task) => task.id == 'task-1');

  setUp(() async {
    repository = _MockTaskRepository();
    cubit = TaskBoardDetailCubit(taskRepository: repository);
    pendingUpdate = Completer<TaskBoardTask>();
    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-1'),
    ).thenAnswer((_) async => boardDetail);
    when(
      () => repository.getBoardTasksForList(
        any(),
        listId: any(named: 'listId'),
        limit: any(named: 'limit'),
        offset: any(named: 'offset'),
        members: any(named: 'members'),
        labels: any(named: 'labels'),
        projects: any(named: 'projects'),
      ),
    ).thenAnswer((_) async => boardDetail.tasks);
    when(
      () => repository.updateBoardTask(
        wsId: any(named: 'wsId'),
        taskId: any(named: 'taskId'),
        name: any(named: 'name'),
        priority: any(named: 'priority'),
        startDate: any(named: 'startDate'),
        endDate: any(named: 'endDate'),
        estimationPoints: any(named: 'estimationPoints'),
        labelIds: any(named: 'labelIds'),
        projectIds: any(named: 'projectIds'),
        assigneeIds: any(named: 'assigneeIds'),
        clearPriority: any(named: 'clearPriority'),
        clearStartDate: any(named: 'clearStartDate'),
        clearEndDate: any(named: 'clearEndDate'),
        clearEstimationPoints: any(named: 'clearEstimationPoints'),
      ),
    ).thenAnswer((_) => pendingUpdate.future);
    await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-1');
  });

  tearDown(() => cubit.close());

  test('a second update while one saves changes nothing and throws an '
      'Exception', () async {
    final first = cubit.updateTask(
      taskId: 'task-1',
      name: 'Task',
      priority: 'high',
    );
    expect(cubit.state.isMutating, isTrue);
    expect(task().priority, 'high');

    await expectLater(
      cubit.updateTask(taskId: 'task-1', name: 'Task', priority: 'critical'),
      throwsA(isA<TaskBoardMutationInProgressException>()),
    );
    await expectLater(
      cubit.moveTask(taskId: 'task-1', listId: 'list-2'),
      throwsA(isA<Exception>()),
    );
    // The rejected calls applied no optimistic change.
    expect(task().priority, 'high');
    expect(task().listId, 'list-1');

    pendingUpdate.complete(
      const TaskBoardTask(
        id: 'task-1',
        listId: 'list-1',
        name: 'Task',
        priority: 'high',
      ),
    );
    await first;
  });

  test('clearPriority empties the priority optimistically', () async {
    final update = cubit.updateTask(
      taskId: 'task-1',
      name: 'Task',
      clearPriority: true,
    );
    expect(task().priority, isNull);
    verify(
      () => repository.updateBoardTask(
        wsId: 'ws-1',
        taskId: 'task-1',
        name: 'Task',
        priority: any(named: 'priority'),
        startDate: any(named: 'startDate'),
        endDate: any(named: 'endDate'),
        estimationPoints: any(named: 'estimationPoints'),
        labelIds: any(named: 'labelIds'),
        projectIds: any(named: 'projectIds'),
        assigneeIds: any(named: 'assigneeIds'),
        clearPriority: true,
        clearStartDate: any(named: 'clearStartDate'),
        clearEndDate: any(named: 'clearEndDate'),
        clearEstimationPoints: any(named: 'clearEstimationPoints'),
      ),
    ).called(1);
    pendingUpdate.complete(
      const TaskBoardTask(id: 'task-1', listId: 'list-1', name: 'Task'),
    );
    await update;
  });
}
