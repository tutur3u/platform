import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockTaskRepository extends Mock implements TaskRepository {}

void main() {
  group('TaskBoardDetailCubit description mutation path', () {
    late _MockTaskRepository repository;
    late TaskBoardDetailCubit cubit;

    const boardDetail = TaskBoardDetail(
      id: 'board-1',
      wsId: 'ws-1',
      tasks: [TaskBoardTask(id: 'task-1', listId: 'list-1', name: 'Task')],
    );

    setUp(() async {
      repository = _MockTaskRepository();
      cubit = TaskBoardDetailCubit(taskRepository: repository);

      when(() => repository.getTaskBoardDetail('ws-1', 'board-1')).thenAnswer(
        (_) async => boardDetail,
      );
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
      ).thenAnswer(
        (_) async => const TaskBoardTask(id: 'task-1', listId: 'list-1'),
      );
      when(
        () => repository.updateTaskDescription(
          wsId: any(named: 'wsId'),
          taskId: any(named: 'taskId'),
          description: any(named: 'description'),
          descriptionYjsState: any(named: 'descriptionYjsState'),
        ),
      ).thenAnswer((_) async {});
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

      await cubit.loadBoardDetail(wsId: 'ws-1', boardId: 'board-1');
    });

    tearDown(() async {
      await cubit.close();
    });

    test(
      'updates description through dedicated endpoint when provided',
      () async {
        const tiptapDescription =
            '{"type":"doc","content":[{"type":"paragraph",'
            '"content":[{"type":"text","text":"Hello"}]}]}';

        await cubit.updateTask(
          taskId: 'task-1',
          name: 'Task updated',
          description: tiptapDescription,
        );

        verify(
          () => repository.updateBoardTask(
            wsId: 'ws-1',
            taskId: 'task-1',
            name: 'Task updated',
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
          () => repository.updateTaskDescription(
            wsId: 'ws-1',
            taskId: 'task-1',
            description: tiptapDescription,
            descriptionYjsState: any(named: 'descriptionYjsState'),
          ),
        ).called(1);
      },
    );

    test(
      'clears description through dedicated endpoint when requested',
      () async {
        await cubit.updateTask(
          taskId: 'task-1',
          name: 'Task updated',
          clearDescription: true,
        );

        verify(
          () => repository.updateTaskDescription(
            wsId: 'ws-1',
            taskId: 'task-1',
            description: any(named: 'description'),
            descriptionYjsState: any(named: 'descriptionYjsState'),
          ),
        ).called(1);
      },
    );

    test(
      'skips dedicated description endpoint when description is unchanged',
      () async {
        await cubit.updateTask(
          taskId: 'task-1',
          name: 'Task updated',
        );

        verifyNever(
          () => repository.updateTaskDescription(
            wsId: any(named: 'wsId'),
            taskId: any(named: 'taskId'),
            description: any(named: 'description'),
            descriptionYjsState: any(named: 'descriptionYjsState'),
          ),
        );
      },
    );
  });
}
