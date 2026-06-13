import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_boards_page.dart';
import 'package:mobile/data/models/task_bulk.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockTaskRepository extends Mock implements TaskRepository {}

void main() {
  group('TaskBoardDetailCubit bulk operations', () {
    late _MockTaskRepository repository;
    late TaskBoardDetailCubit cubit;
    late List<TaskBoardTask> repositoryTasks;

    const listActive = TaskBoardList(
      id: 'list-active',
      boardId: 'board-1',
      name: 'Active',
      status: 'active',
      color: 'BLUE',
    );
    const listDone = TaskBoardList(
      id: 'list-done',
      boardId: 'board-1',
      name: 'Done',
      status: 'done',
      color: 'GREEN',
    );
    const listClosed = TaskBoardList(
      id: 'list-closed',
      boardId: 'board-1',
      name: 'Closed',
      status: 'closed',
      color: 'GRAY',
    );
    const listDocuments = TaskBoardList(
      id: 'list-documents',
      boardId: 'board-1',
      name: 'Documents',
      status: 'documents',
      color: 'PURPLE',
    );

    const taskOne = TaskBoardTask(
      id: 'task-1',
      listId: 'list-active',
      name: 'First task',
      labelIds: ['label-a'],
      projectIds: ['project-a'],
      assigneeIds: ['user-a'],
    );
    const taskTwo = TaskBoardTask(
      id: 'task-2',
      listId: 'list-active',
      name: 'Second task',
      labelIds: ['label-a', 'label-b'],
      projectIds: ['project-a', 'project-b'],
      assigneeIds: ['user-a', 'user-b'],
    );
    const taskDone = TaskBoardTask(
      id: 'task-done',
      listId: 'list-done',
      name: 'Done task',
    );
    const taskClosed = TaskBoardTask(
      id: 'task-closed',
      listId: 'list-closed',
      name: 'Closed task',
    );
    const taskDocuments = TaskBoardTask(
      id: 'task-documents',
      listId: 'list-documents',
      name: 'Documents task',
    );

    TaskBoardDetail buildBoard({List<TaskBoardTask>? tasks}) {
      return const TaskBoardDetail(
        id: 'board-1',
        wsId: 'ws-1',
        name: 'Board',
        lists: [listActive, listDone, listClosed, listDocuments],
      ).copyWith(
        tasks: tasks ?? repositoryTasks,
        projects: [
          TaskProjectSummary(
            id: 'project-c',
            name: 'Project C',
            wsId: 'ws-1',
            creatorId: 'user-a',
            createdAt: DateTime(2024),
            tasksCount: 0,
            completedTasksCount: 0,
            linkedTasks: const [],
          ),
        ],
      );
    }

    TaskBulkResult buildBulkResult({
      List<String> succeeded = const ['task-1', 'task-2'],
      List<TaskBulkFailure> failures = const [],
    }) {
      return TaskBulkResult(
        successCount: succeeded.length,
        failCount: failures.length,
        taskIds: const ['task-1', 'task-2'],
        succeededTaskIds: succeeded,
        failures: failures,
        taskMetaById: const <String, TaskBulkTaskMeta>{},
      );
    }

    setUpAll(() {
      registerFallbackValue(TaskBulkOperation.clearLabels);
    });

    setUp(() async {
      repository = _MockTaskRepository();
      cubit = TaskBoardDetailCubit(taskRepository: repository);
      repositoryTasks = [taskOne, taskTwo, taskDone, taskClosed, taskDocuments];

      when(
        () => repository.getTaskBoardDetail('ws-1', 'board-1'),
      ).thenAnswer((_) async => buildBoard());

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
      ).thenAnswer((invocation) async {
        final listId = invocation.namedArguments[#listId] as String;
        return repositoryTasks
            .where((task) => task.listId == listId)
            .toList(growable: false);
      });

      when(
        () => repository.moveBoardTask(
          wsId: any(named: 'wsId'),
          taskId: any(named: 'taskId'),
          listId: any(named: 'listId'),
        ),
      ).thenAnswer((invocation) async {
        final taskId = invocation.namedArguments[#taskId] as String;
        final listId = invocation.namedArguments[#listId] as String;
        final task = repositoryTasks.firstWhere((task) => task.id == taskId);
        final moved = task.copyWith(listId: listId);
        repositoryTasks = repositoryTasks
            .map((task) => task.id == taskId ? moved : task)
            .toList(growable: false);
        return moved;
      });

      when(
        () => repository.createBoardTask(
          wsId: any(named: 'wsId'),
          listId: any(named: 'listId'),
          name: any(named: 'name'),
          description: any(named: 'description'),
          priority: any(named: 'priority'),
          startDate: any(named: 'startDate'),
          endDate: any(named: 'endDate'),
          estimationPoints: any(named: 'estimationPoints'),
          labelIds: any(named: 'labelIds'),
          projectIds: any(named: 'projectIds'),
          assigneeIds: any(named: 'assigneeIds'),
        ),
      ).thenAnswer((invocation) async {
        final listId = invocation.namedArguments[#listId] as String;
        final name = invocation.namedArguments[#name] as String;
        final created = TaskBoardTask(
          id: 'task-created-${repositoryTasks.length}',
          listId: listId,
          name: name,
        );
        repositoryTasks = [...repositoryTasks, created];
        return created;
      });

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
          clearStartDate: any(named: 'clearStartDate'),
          clearEndDate: any(named: 'clearEndDate'),
          clearEstimationPoints: any(named: 'clearEstimationPoints'),
        ),
      ).thenAnswer((invocation) async {
        final taskId = invocation.namedArguments[#taskId] as String;
        final name = invocation.namedArguments[#name] as String?;
        final task = repositoryTasks.firstWhere((task) => task.id == taskId);
        final updated = task.copyWith(name: name ?? task.name);
        repositoryTasks = repositoryTasks
            .map((task) => task.id == taskId ? updated : task)
            .toList(growable: false);
        return updated;
      });

      when(
        () => repository.bulkBoardTasks(
          wsId: any(named: 'wsId'),
          taskIds: any(named: 'taskIds'),
          operation: any(named: 'operation'),
        ),
      ).thenAnswer((_) async => buildBulkResult());

      when(
        () => repository.getTaskBoards(
          'ws-1',
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) async => TaskBoardsPage(
          boards: [
            TaskBoardSummary(
              id: 'board-1',
              wsId: 'ws-1',
              name: 'Board 1',
              createdAt: DateTime(2024),
            ),
            TaskBoardSummary(
              id: 'board-2',
              wsId: 'ws-1',
              name: 'Board 2',
              createdAt: DateTime(2024, 1, 2),
            ),
          ],
          totalCount: 2,
          page: 1,
          pageSize: 200,
        ),
      );

      await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-1');
    });

    tearDown(() async {
      if (!cubit.isClosed) {
        await cubit.close();
      }
    });

    test('enters and exits bulk select mode', () {
      cubit.enterBulkSelectMode(initialTaskId: 'task-1');

      expect(cubit.state.isBulkSelectMode, isTrue);
      expect(cubit.state.selectedTaskIds, {'task-1'});

      cubit.exitBulkSelectMode();

      expect(cubit.state.isBulkSelectMode, isFalse);
      expect(cubit.state.selectedTaskIds, isEmpty);
    });

    test('toggle selection adds and removes selected task', () {
      cubit
        ..enterBulkSelectMode()
        ..toggleBulkTaskSelection('task-1')
        ..toggleBulkTaskSelection('task-2');

      expect(cubit.state.selectedTaskIds, {'task-1', 'task-2'});

      cubit.toggleBulkTaskSelection('task-2');
      expect(cubit.state.selectedTaskIds, {'task-1'});
      expect(cubit.state.isBulkSelectMode, isTrue);

      cubit.toggleBulkTaskSelection('task-1');
      expect(cubit.state.selectedTaskIds, isEmpty);
      expect(cubit.state.isBulkSelectMode, isFalse);
    });

    test('selectAllFilteredTasks selects all filtered tasks', () {
      cubit
        ..setSearchQuery('second')
        ..selectAllFilteredTasks();

      expect(cubit.state.isBulkSelectMode, isTrue);
      expect(cubit.state.selectedTaskIds, {'task-2'});
    });

    test('list view hides documents tasks by default', () {
      expect(cubit.state.filteredTasksForListView.map((task) => task.id), [
        'task-1',
        'task-2',
        'task-done',
        'task-closed',
      ]);

      cubit.setFilters(
        const TaskBoardDetailFilters(statuses: {'documents', 'done', 'closed'}),
      );

      expect(cubit.state.filteredTasksForListView.map((task) => task.id), [
        'task-done',
        'task-closed',
        'task-documents',
      ]);

      cubit.setFilters(
        const TaskBoardDetailFilters(listIds: {'list-documents'}),
      );

      expect(cubit.state.filteredTasksForListView.map((task) => task.id), [
        'task-documents',
      ]);
    });

    test('moveTask refreshes source and target lists', () async {
      clearInteractions(repository);

      await cubit.moveTask(taskId: 'task-1', listId: 'list-done');

      verify(
        () => repository.moveBoardTask(
          wsId: 'ws-1',
          taskId: 'task-1',
          listId: 'list-done',
        ),
      ).called(1);
      verify(
        () => repository.getBoardTasksForList(
          'ws-1',
          listId: 'list-active',
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
          members: any(named: 'members'),
          labels: any(named: 'labels'),
          projects: any(named: 'projects'),
        ),
      ).called(1);
      verify(
        () => repository.getBoardTasksForList(
          'ws-1',
          listId: 'list-done',
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
          members: any(named: 'members'),
          labels: any(named: 'labels'),
          projects: any(named: 'projects'),
        ),
      ).called(1);
    });

    test(
      'moveTask updates local list state before refresh completes',
      () async {
        clearInteractions(repository);
        final boardRefreshCompleter = Completer<TaskBoardDetail>();

        when(
          () => repository.getTaskBoardDetail('ws-1', 'board-1'),
        ).thenAnswer((_) => boardRefreshCompleter.future);

        final move = cubit.moveTask(taskId: 'task-1', listId: 'list-done');
        await Future<void>.delayed(Duration.zero);

        expect(
          cubit.state.listTasksByListId['list-active']?.map((task) => task.id),
          isNot(contains('task-1')),
        );
        expect(
          cubit.state.listTasksByListId['list-done']?.map((task) => task.id),
          contains('task-1'),
        );

        try {
          boardRefreshCompleter.complete(buildBoard());
          await move;
        } finally {
          if (!boardRefreshCompleter.isCompleted) {
            boardRefreshCompleter.complete(buildBoard());
          }
        }
      },
    );

    test(
      'moveTask updates local list state before repository completes',
      () async {
        clearInteractions(repository);
        final moveCompleter = Completer<TaskBoardTask>();
        when(
          () => repository.moveBoardTask(
            wsId: 'ws-1',
            taskId: 'task-1',
            listId: 'list-done',
          ),
        ).thenAnswer((_) => moveCompleter.future);

        final move = cubit.moveTask(taskId: 'task-1', listId: 'list-done');
        await Future<void>.delayed(Duration.zero);

        expect(
          cubit.state.listTasksByListId['list-active']?.map((task) => task.id),
          isNot(contains('task-1')),
        );
        expect(
          cubit.state.board?.tasks
              .firstWhere((task) => task.id == 'task-1')
              .listId,
          'list-done',
        );

        moveCompleter.complete(taskOne.copyWith(listId: 'list-done'));
        await move;
      },
    );

    test('createTask refreshes board metadata and the affected list', () async {
      clearInteractions(repository);

      await cubit.createTask(listId: 'list-active', name: 'Created task');

      verify(
        () => repository.createBoardTask(
          wsId: 'ws-1',
          listId: 'list-active',
          name: 'Created task',
          description: any(named: 'description'),
          priority: any(named: 'priority'),
          startDate: any(named: 'startDate'),
          endDate: any(named: 'endDate'),
          estimationPoints: any(named: 'estimationPoints'),
          labelIds: any(named: 'labelIds'),
          projectIds: any(named: 'projectIds'),
          assigneeIds: any(named: 'assigneeIds'),
        ),
      ).called(1);
      verify(
        () => repository.getBoardTasksForList(
          'ws-1',
          listId: 'list-active',
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
          members: any(named: 'members'),
          labels: any(named: 'labels'),
          projects: any(named: 'projects'),
        ),
      ).called(1);
      verify(() => repository.getTaskBoardDetail('ws-1', 'board-1')).called(1);
    });

    test('loadListTasks ignores list load failure after close', () async {
      final listLoadCompleter = Completer<List<TaskBoardTask>>();
      when(
        () => repository.getBoardTasksForList(
          'ws-1',
          listId: 'list-active',
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
          members: any(named: 'members'),
          labels: any(named: 'labels'),
          projects: any(named: 'projects'),
        ),
      ).thenAnswer((_) => listLoadCompleter.future);

      final load = cubit.loadListTasks(
        listId: 'list-active',
        forceRefresh: true,
      );
      await Future<void>.delayed(Duration.zero);

      await cubit.close();
      listLoadCompleter.completeError(Exception('list load failed'));

      await expectLater(load, completes);
    });

    test('updateTask refreshes board metadata and the affected list', () async {
      clearInteractions(repository);

      await cubit.updateTask(
        taskId: 'task-1',
        listId: 'list-active',
        name: 'Updated task',
      );

      verify(
        () => repository.updateBoardTask(
          wsId: 'ws-1',
          taskId: 'task-1',
          name: 'Updated task',
          priority: any(named: 'priority'),
          startDate: any(named: 'startDate'),
          endDate: any(named: 'endDate'),
          estimationPoints: any(named: 'estimationPoints'),
          labelIds: any(named: 'labelIds'),
          projectIds: any(named: 'projectIds'),
          assigneeIds: any(named: 'assigneeIds'),
          clearStartDate: any(named: 'clearStartDate'),
          clearEndDate: any(named: 'clearEndDate'),
          clearEstimationPoints: any(named: 'clearEstimationPoints'),
        ),
      ).called(1);
      verify(
        () => repository.getBoardTasksForList(
          'ws-1',
          listId: 'list-active',
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
          members: any(named: 'members'),
          labels: any(named: 'labels'),
          projects: any(named: 'projects'),
        ),
      ).called(1);
      verify(() => repository.getTaskBoardDetail('ws-1', 'board-1')).called(1);
    });

    test('updateTask reflects priority immediately in loaded lists', () async {
      clearInteractions(repository);
      final updateCompleter = Completer<void>();
      when(
        () => repository.updateBoardTask(
          wsId: 'ws-1',
          taskId: 'task-1',
          name: 'First task',
          priority: 'critical',
          startDate: any(named: 'startDate'),
          endDate: any(named: 'endDate'),
          estimationPoints: any(named: 'estimationPoints'),
          labelIds: any(named: 'labelIds'),
          projectIds: any(named: 'projectIds'),
          assigneeIds: any(named: 'assigneeIds'),
          clearStartDate: any(named: 'clearStartDate'),
          clearEndDate: any(named: 'clearEndDate'),
          clearEstimationPoints: any(named: 'clearEstimationPoints'),
        ),
      ).thenAnswer((_) async {
        await updateCompleter.future;
        final updated = taskOne.copyWith(priority: 'critical');
        repositoryTasks = repositoryTasks
            .map((task) => task.id == 'task-1' ? updated : task)
            .toList(growable: false);
        return updated;
      });

      final update = cubit.updateTask(
        taskId: 'task-1',
        listId: 'list-active',
        name: 'First task',
        priority: 'critical',
      );
      await Future<void>.delayed(Duration.zero);

      expect(
        cubit.state.listTasksByListId['list-active']
            ?.firstWhere((task) => task.id == 'task-1')
            .priority,
        'critical',
      );
      expect(
        cubit.state.board?.tasks
            .firstWhere((task) => task.id == 'task-1')
            .priority,
        'critical',
      );

      updateCompleter.complete();
      await update;
    });

    test('updateTask applies repository returned task snapshots', () async {
      clearInteractions(repository);
      when(
        () => repository.updateBoardTask(
          wsId: 'ws-1',
          taskId: 'task-1',
          name: 'Submitted task',
          priority: 'high',
          startDate: any(named: 'startDate'),
          endDate: any(named: 'endDate'),
          estimationPoints: any(named: 'estimationPoints'),
          labelIds: any(named: 'labelIds'),
          projectIds: any(named: 'projectIds'),
          assigneeIds: any(named: 'assigneeIds'),
          clearStartDate: any(named: 'clearStartDate'),
          clearEndDate: any(named: 'clearEndDate'),
          clearEstimationPoints: any(named: 'clearEstimationPoints'),
        ),
      ).thenAnswer((_) async {
        final updated = taskOne.copyWith(
          name: 'Server task',
          priority: 'critical',
        );
        repositoryTasks = repositoryTasks
            .map((task) => task.id == 'task-1' ? updated : task)
            .toList(growable: false);
        return updated;
      });

      await cubit.updateTask(
        taskId: 'task-1',
        listId: 'list-active',
        name: 'Submitted task',
        priority: 'high',
      );

      expect(
        cubit.state.listTasksByListId['list-active']
            ?.firstWhere((task) => task.id == 'task-1')
            .name,
        'Server task',
      );
      expect(
        cubit.state.board?.tasks
            .firstWhere((task) => task.id == 'task-1')
            .priority,
        'critical',
      );
    });

    test(
      'bulkMoveToStatus resolves done list and sends move_to_list operation',
      () async {
        cubit.enterBulkSelectMode(initialTaskId: 'task-1');
        await cubit.bulkMoveToStatus('done');

        final verification = verify(
          () => repository.bulkBoardTasks(
            wsId: 'ws-1',
            taskIds: captureAny(named: 'taskIds'),
            operation: captureAny(named: 'operation'),
          ),
        )..called(1);

        final captured = verification.captured;
        final taskIds = captured[0] as List<String>;
        final operation = captured[1] as TaskBulkOperation;

        expect(taskIds, ['task-1']);
        expect(operation.type, 'move_to_list');
        expect(operation.listId, 'list-done');
      },
    );

    test('bulkUpdateDueDatePreset clear sends null end_date', () async {
      cubit.enterBulkSelectMode(initialTaskId: 'task-1');
      await cubit.bulkUpdateDueDatePreset('clear');

      final verification = verify(
        () => repository.bulkBoardTasks(
          wsId: 'ws-1',
          taskIds: captureAny(named: 'taskIds'),
          operation: captureAny(named: 'operation'),
        ),
      )..called(1);
      final operation = verification.captured[1] as TaskBulkOperation;

      expect(operation.type, 'update_fields');
      expect(operation.updates, {'end_date': null});
    });

    test('bulk updates refresh board metadata and affected lists', () async {
      clearInteractions(repository);

      cubit.enterBulkSelectMode(initialTaskId: 'task-1');
      await cubit.bulkUpdatePriority('high');

      verify(() => repository.getTaskBoardDetail('ws-1', 'board-1')).called(1);
      verify(
        () => repository.getBoardTasksForList(
          'ws-1',
          listId: 'list-active',
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
          members: any(named: 'members'),
          labels: any(named: 'labels'),
          projects: any(named: 'projects'),
        ),
      ).called(1);
    });

    test(
      'bulk updates refresh affected lists when API omits succeeded ids',
      () async {
        when(
          () => repository.bulkBoardTasks(
            wsId: any(named: 'wsId'),
            taskIds: any(named: 'taskIds'),
            operation: any(named: 'operation'),
          ),
        ).thenAnswer(
          (_) async => const TaskBulkResult(
            successCount: 1,
            failCount: 0,
            taskIds: ['task-1'],
            succeededTaskIds: [],
            failures: [],
            taskMetaById: <String, TaskBulkTaskMeta>{},
          ),
        );
        clearInteractions(repository);

        cubit.enterBulkSelectMode(initialTaskId: 'task-1');
        await cubit.bulkUpdatePriority('high');

        verify(
          () => repository.getTaskBoardDetail('ws-1', 'board-1'),
        ).called(1);
        verify(
          () => repository.getBoardTasksForList(
            'ws-1',
            listId: 'list-active',
            limit: any(named: 'limit'),
            offset: any(named: 'offset'),
            members: any(named: 'members'),
            labels: any(named: 'labels'),
            projects: any(named: 'projects'),
          ),
        ).called(1);
      },
    );

    test(
      'bulk project changes patch task snapshots before refresh completes',
      () async {
        clearInteractions(repository);
        final boardRefreshCompleter = Completer<TaskBoardDetail>();
        when(
          () => repository.getTaskBoardDetail('ws-1', 'board-1'),
        ).thenAnswer((_) => boardRefreshCompleter.future);

        cubit.enterBulkSelectMode(initialTaskId: 'task-1');
        final action = cubit.bulkAddProject('project-c');
        await Future<void>.delayed(Duration.zero);

        try {
          final listTask = cubit.state.listTasksByListId['list-active']
              ?.firstWhere((task) => task.id == 'task-1');
          final boardTask = cubit.state.board?.tasks.firstWhere(
            (task) => task.id == 'task-1',
          );

          expect(listTask?.projectIds, contains('project-c'));
          expect(
            listTask?.projects.map((project) => project.name),
            contains('Project C'),
          );
          expect(boardTask?.projectIds, contains('project-c'));
        } finally {
          repositoryTasks = repositoryTasks
              .map(
                (task) => task.id == 'task-1'
                    ? task.copyWith(
                        projectIds: [...task.projectIds, 'project-c'],
                        projects: const [
                          TaskBoardTaskProject(
                            id: 'project-c',
                            name: 'Project C',
                          ),
                        ],
                      )
                    : task,
              )
              .toList(growable: false);
          if (!boardRefreshCompleter.isCompleted) {
            boardRefreshCompleter.complete(buildBoard());
          }
          await action;
        }
      },
    );

    test(
      'bulk update keeps only failed ids selected on partial success',
      () async {
        when(
          () => repository.bulkBoardTasks(
            wsId: any(named: 'wsId'),
            taskIds: any(named: 'taskIds'),
            operation: any(named: 'operation'),
          ),
        ).thenAnswer(
          (_) async => buildBulkResult(
            succeeded: const ['task-1'],
            failures: const [TaskBulkFailure(taskId: 'task-2', error: 'boom')],
          ),
        );

        cubit
          ..enterBulkSelectMode()
          ..toggleBulkTaskSelection('task-1')
          ..toggleBulkTaskSelection('task-2');

        final result = await cubit.bulkUpdatePriority('high');

        expect(result.successCount, 1);
        expect(result.failCount, 1);
        expect(cubit.state.selectedTaskIds, {'task-2'});
        expect(cubit.state.isBulkSelectMode, isTrue);
      },
    );

    test('bulk update clears selection when all succeed', () async {
      cubit
        ..enterBulkSelectMode()
        ..toggleBulkTaskSelection('task-1')
        ..toggleBulkTaskSelection('task-2');

      await cubit.bulkClearLabels();

      expect(cubit.state.selectedTaskIds, isEmpty);
      expect(cubit.state.isBulkSelectMode, isFalse);
    });

    test(
      'bulkMoveToList forwards targetBoardId for cross-board moves',
      () async {
        cubit.enterBulkSelectMode(initialTaskId: 'task-1');
        await cubit.bulkMoveToList(
          listId: 'target-list-1',
          targetBoardId: 'board-2',
        );

        final verification = verify(
          () => repository.bulkBoardTasks(
            wsId: 'ws-1',
            taskIds: any(named: 'taskIds'),
            operation: captureAny(named: 'operation'),
          ),
        )..called(1);
        final operation = verification.captured.single as TaskBulkOperation;

        expect(operation.type, 'move_to_list');
        expect(operation.listId, 'target-list-1');
        expect(operation.targetBoardId, 'board-2');
      },
    );
  });
}
