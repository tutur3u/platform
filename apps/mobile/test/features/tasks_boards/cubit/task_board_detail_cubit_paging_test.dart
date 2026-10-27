import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockTaskRepository extends Mock implements TaskRepository {}

String _description(String text) =>
    '{"type":"doc","content":[{"type":"paragraph",'
    '"content":[{"type":"text","text":"$text"}]}]}';

TaskBoardTask _task(String listId, int i) => TaskBoardTask(
  id: '$listId-$i',
  listId: listId,
  name: 'Task $i',
  description: _description('Note $listId $i'),
);

void main() {
  late _MockTaskRepository repository;
  late TaskBoardDetailCubit cubit;
  final requests = <({String listId, int limit, int offset})>[];
  final held = <String, Completer<List<TaskBoardTask>>>{};

  const board = TaskBoardDetail(
    id: 'board-1',
    wsId: 'ws-1',
    lists: [
      TaskBoardList(id: 'a', boardId: 'board-1', status: 'active'),
      TaskBoardList(id: 'b', boardId: 'board-1', status: 'active'),
      TaskBoardList(id: 'done', boardId: 'board-1', status: 'done'),
    ],
  );
  final tasksByList = {
    'a': [for (var i = 0; i < 250; i++) _task('a', i)],
    'b': [for (var i = 0; i < 30; i++) _task('b', i)],
  };

  setUp(() async {
    requests.clear();
    held.clear();
    repository = _MockTaskRepository();
    cubit = TaskBoardDetailCubit(taskRepository: repository);
    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-1'),
    ).thenAnswer((_) async => board);
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
    ).thenAnswer((invocation) {
      final listId = invocation.namedArguments[#listId] as String;
      final limit = invocation.namedArguments[#limit] as int;
      final offset = invocation.namedArguments[#offset] as int;
      requests.add((listId: listId, limit: limit, offset: offset));
      final hold = held[listId];
      if (hold != null) return hold.future;
      return Future.value(
        (tasksByList[listId] ?? const <TaskBoardTask>[])
            .skip(offset)
            .take(limit)
            .toList(),
      );
    });
    await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-1');
  });

  tearDown(() => cubit.close());

  test('a page arrival re-processes only its own list', () async {
    // Loading the board fetched the first page (50) of every list.
    final listB = cubit.state.listTasksByListId['b'];
    expect(listB, hasLength(30));
    final noteA0 = cubit.state.taskDescriptionSearchIndex['a-0'];
    expect(noteA0, 'note a 0');

    await cubit.loadListTasks(listId: 'a', loadMore: true, pageSizeHint: 100);

    // List b is untouched and the earlier page's index entry is reused, so
    // its description was not parsed again.
    expect(identical(cubit.state.listTasksByListId['b'], listB), isTrue);
    expect(
      identical(cubit.state.taskDescriptionSearchIndex['a-0'], noteA0),
      isTrue,
    );
    expect(cubit.state.taskDescriptionSearchIndex['a-120'], 'note a 120');
    expect(cubit.state.listTasksByListId['a'], hasLength(150));
  });

  test('a larger hint grows the page size of later pages', () async {
    // The board load fetched list a's first page at the default 50.
    requests.clear();
    await cubit.loadListTasks(listId: 'a', loadMore: true, pageSizeHint: 100);
    await cubit.loadListTasks(listId: 'a', loadMore: true, pageSizeHint: 15);

    expect(requests.map((request) => (request.limit, request.offset)), [
      (100, 50),
      (100, 150),
    ]);
  });

  test('a rejected concurrent move leaves list loads able to finish', () async {
    final pendingUpdate = Completer<TaskBoardTask>();
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
    final update = cubit.updateTask(
      taskId: 'a-0',
      name: 'Task 0',
      priority: 'high',
    );
    held['b'] = Completer();
    final load = cubit.loadListTasks(listId: 'b', forceRefresh: true);
    expect(cubit.state.loadingListIds, contains('b'));

    // Rejected before it touches anything: in-flight reads stay valid.
    await expectLater(
      cubit.moveTask(taskId: 'a-1', listId: 'done'),
      throwsA(isA<TaskBoardMutationInProgressException>()),
    );
    held['b']!.complete(tasksByList['b']!.toList());
    await load;

    expect(cubit.state.loadingListIds, isNot(contains('b')));
    expect(cubit.state.listTasksByListId['b'], hasLength(30));
    pendingUpdate.complete(
      const TaskBoardTask(id: 'a-0', listId: 'a', name: 'Task 0'),
    );
    await update;
  });
}
