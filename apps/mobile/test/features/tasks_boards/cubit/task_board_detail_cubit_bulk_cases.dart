part of 'task_board_detail_cubit_bulk_test.dart';

void _registerQueuedBulkTests(
  _MockTaskRepository Function() repositoryRef,
  TaskBoardDetailCubit Function() cubitRef,
) {
  final repository = repositoryRef;
  final cubit = cubitRef;
  test(
    'queued bulk edit keeps local state without a network refresh',
    () async {
      when(
        () => repository().bulkBoardTasks(
          wsId: any(named: 'wsId'),
          taskIds: any(named: 'taskIds'),
          operation: any(named: 'operation'),
        ),
      ).thenAnswer(
        (_) async => const TaskBulkResult(
          successCount: 0,
          failCount: 0,
          taskIds: ['task-1'],
          succeededTaskIds: ['task-1'],
          failures: [],
          taskMetaById: <String, TaskBulkTaskMeta>{},
          queued: true,
        ),
      );
      clearInteractions(repository());

      cubit().enterBulkSelectMode(initialTaskId: 'task-1');
      final result = await cubit().bulkUpdatePriority('high');

      expect(result.queued, isTrue);
      expect(result.successCount, 0);
      expect(cubit().state.selectedTaskIds, isEmpty);
      verifyNever(() => repository().getTaskBoardDetail('ws-1', 'board-1'));
    },
  );

  test('bulk update clears selection when all succeed', () async {
    cubit()
      ..enterBulkSelectMode()
      ..toggleBulkTaskSelection('task-1')
      ..toggleBulkTaskSelection('task-2');

    await cubit().bulkClearLabels();

    expect(cubit().state.selectedTaskIds, isEmpty);
    expect(cubit().state.isBulkSelectMode, isFalse);
  });
}
