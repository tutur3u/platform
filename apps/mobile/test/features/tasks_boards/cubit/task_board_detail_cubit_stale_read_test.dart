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
  late List<Completer<List<TaskBoardTask>>> list1Reads;

  const task = TaskBoardTask(
    id: 'task-1',
    listId: 'list-1',
    name: 'Task',
    priority: 'low',
  );
  const boardDetail = TaskBoardDetail(
    id: 'board-1',
    wsId: 'ws-1',
    lists: [
      TaskBoardList(id: 'list-1', boardId: 'board-1', status: 'active'),
      TaskBoardList(id: 'list-2', boardId: 'board-1', status: 'done'),
    ],
    tasks: [task],
  );

  When<Future<List<TaskBoardTask>>> stubListRead(String listId) => when(
    () => repository.getBoardTasksForList(
      any(),
      listId: listId,
      limit: any(named: 'limit'),
      offset: any(named: 'offset'),
      members: any(named: 'members'),
      labels: any(named: 'labels'),
      projects: any(named: 'projects'),
    ),
  );

  Future<void> settle() async {
    for (var i = 0; i < 10; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  Future<void> waitUntil(bool Function() condition) async {
    for (var i = 0; i < 1000 && !condition(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(condition(), isTrue);
  }

  setUp(() async {
    repository = _MockTaskRepository();
    cubit = TaskBoardDetailCubit(taskRepository: repository);
    list1Reads = [];
    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-1'),
    ).thenAnswer((_) async => boardDetail);
    stubListRead('list-1').thenAnswer((_) async => boardDetail.tasks);
    stubListRead('list-2').thenAnswer((_) async => const <TaskBoardTask>[]);
    when(
      () => repository.moveBoardTask(
        wsId: any(named: 'wsId'),
        taskId: any(named: 'taskId'),
        listId: any(named: 'listId'),
      ),
    ).thenAnswer((_) async => task.copyWith(listId: 'list-2'));
    await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-1');
    await settle();

    // From here on, reads of list-1 stay in flight until a test completes them.
    stubListRead('list-1').thenAnswer((_) {
      final read = Completer<List<TaskBoardTask>>();
      list1Reads.add(read);
      return read.future;
    });
  });

  tearDown(() => cubit.close());

  test('a read dropped by moveTask does not leave its list loading when the '
      'board refresh fails', () async {
    final staleRead = cubit.loadListTasks(listId: 'list-1', forceRefresh: true);
    await settle();
    expect(list1Reads, hasLength(1));
    expect(cubit.state.loadingListIds, contains('list-1'));

    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-1'),
    ).thenAnswer((_) async => throw Exception('refresh failed'));
    final move = cubit.moveTask(taskId: 'task-1', listId: 'list-2');
    await waitUntil(() => cubit.state.status == TaskBoardDetailStatus.error);
    await settle();

    // The move bumped the request token, so this read is now stale.
    list1Reads.single.complete(boardDetail.tasks);
    await staleRead;
    await move;

    expect(cubit.state.loadingListIds, isNot(contains('list-1')));

    // A later refresh of the list is no longer blocked by the loading guard.
    stubListRead('list-1').thenAnswer((_) async => boardDetail.tasks);
    clearInteractions(repository);
    await cubit.loadListTasks(listId: 'list-1', forceRefresh: true);
    verify(
      () => repository.getBoardTasksForList(
        'ws-1',
        listId: 'list-1',
        limit: any(named: 'limit'),
        offset: any(named: 'offset'),
        members: any(named: 'members'),
        labels: any(named: 'labels'),
        projects: any(named: 'projects'),
      ),
    ).called(1);
    expect(cubit.state.loadingListIds, isNot(contains('list-1')));
  });

  test(
    'a dropped read leaves the loading guard of a newer read alone',
    () async {
      final staleRead = cubit.loadListTasks(
        listId: 'list-1',
        forceRefresh: true,
      );
      await settle();
      expect(list1Reads, hasLength(1));

      // The move's successful board refresh resets loading and starts a newer
      // read of list-1 while the dropped one is still in flight.
      final move = cubit.moveTask(taskId: 'task-1', listId: 'list-2');
      await waitUntil(() => list1Reads.length == 2);
      expect(cubit.state.loadingListIds, contains('list-1'));

      list1Reads.first.complete(boardDetail.tasks);
      await staleRead;
      expect(cubit.state.loadingListIds, contains('list-1'));

      list1Reads.last.complete(boardDetail.tasks);
      await move;
      expect(cubit.state.loadingListIds, isNot(contains('list-1')));
    },
  );
}
