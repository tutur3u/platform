import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockTaskRepository extends Mock implements TaskRepository {}

const _label = TaskLabel(
  id: 'label-1',
  wsId: 'ws-1',
  name: 'Bug',
  color: '#EF4444',
);
const _member = WorkspaceUserOption(id: 'user-1', displayName: 'Lan');
const _task = TaskBoardTask(
  id: 'task-1',
  listId: 'list-1',
  name: 'Fix login',
  labelIds: ['label-1'],
  assigneeIds: ['user-1'],
);
const _board = TaskBoardDetail(
  id: 'board-1',
  wsId: 'ws-1',
  name: 'Roadmap',
  lists: [TaskBoardList(id: 'list-1', boardId: 'board-1', status: 'active')],
  labels: [_label],
  members: [_member],
);
final TaskBoardDetail _withoutLabels = _board.copyWith(
  labels: const [],
  unavailableParts: {TaskBoardDetailPart.labels},
);

void main() {
  setUpAll(() => registerFallbackValue(_board));

  late _MockTaskRepository repository;
  late TaskBoardDetailCubit cubit;

  Future<void> waitUntil(bool Function() condition) async {
    for (var i = 0; i < 300 && !condition(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    expect(condition(), isTrue);
  }

  setUp(() {
    repository = _MockTaskRepository();
    cubit = TaskBoardDetailCubit(
      taskRepository: repository,
      partRetryDelays: const [
        Duration(milliseconds: 10),
        Duration(milliseconds: 10),
      ],
    );
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
    ).thenAnswer((_) async => const [_task]);
  });

  tearDown(() => cubit.close());

  test('a board without its labels loads, then merges them when they '
      'arrive', () async {
    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-1'),
    ).thenAnswer((_) async => _withoutLabels);
    when(() => repository.reloadTaskBoardDetailParts(any())).thenAnswer((
      call,
    ) async {
      final detail = call.positionalArguments.first as TaskBoardDetail;
      return detail.copyWith(labels: const [_label], unavailableParts: {});
    });

    await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-1');
    expect(cubit.state.status, TaskBoardDetailStatus.loaded);
    expect(cubit.state.board?.lists.single.id, 'list-1');
    expect(cubit.state.board?.labels, isEmpty);

    await waitUntil(() => cubit.state.board?.unavailableParts.isEmpty ?? false);
    expect(cubit.state.board?.labels, const [_label]);
    expect(cubit.state.board?.members, const [_member]);
    final task = cubit.state.listTasksByListId['list-1']!.single;
    expect(task.labels.single.name, 'Bug');
    expect(task.assignees.single.displayName, 'Lan');
  });

  test('part retries stop after the last delay', () async {
    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-1'),
    ).thenAnswer((_) async => _withoutLabels);
    when(() => repository.reloadTaskBoardDetailParts(any())).thenAnswer(
      (call) async => call.positionalArguments.first as TaskBoardDetail,
    );

    await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-1');
    await Future<void>.delayed(const Duration(milliseconds: 100));

    verify(() => repository.reloadTaskBoardDetailParts(any())).called(2);
    expect(cubit.state.status, TaskBoardDetailStatus.loaded);
    expect(cubit.state.board?.unavailableParts, {TaskBoardDetailPart.labels});
  });

  test('a refresh that loses a part keeps the part already shown', () async {
    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-1'),
    ).thenAnswer((_) async => _board);
    when(() => repository.reloadTaskBoardDetailParts(any())).thenAnswer(
      (call) async => call.positionalArguments.first as TaskBoardDetail,
    );
    await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-1');

    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-1'),
    ).thenAnswer((_) async => _withoutLabels);
    await cubit.reload();

    expect(cubit.state.board?.labels, const [_label]);
    expect(cubit.state.board?.unavailableParts, {TaskBoardDetailPart.labels});
  });

  // Each failure test reads its own board, so no earlier cache hides it.
  test('a failed board read shows the error and retry recovers', () async {
    when(() => repository.getTaskBoardDetail('ws-1', 'board-2')).thenAnswer(
      (_) async =>
          throw const ApiException(message: 'Bad gateway', statusCode: 502),
    );
    await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-2');
    expect(cubit.state.status, TaskBoardDetailStatus.error);
    expect(cubit.state.board, isNull);

    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-2'),
    ).thenAnswer((_) async => _board);
    await cubit.reload();

    expect(cubit.state.status, TaskBoardDetailStatus.loaded);
    expect(cubit.state.board?.name, 'Roadmap');
    verifyNever(() => repository.reloadTaskBoardDetailParts(any()));
  });

  test('a board parse error shows the error instead of loading', () async {
    when(
      () => repository.getTaskBoardDetail('ws-1', 'board-3'),
    ).thenAnswer((_) async => throw TypeError());
    await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-3');

    expect(cubit.state.status, TaskBoardDetailStatus.error);
  });
}
