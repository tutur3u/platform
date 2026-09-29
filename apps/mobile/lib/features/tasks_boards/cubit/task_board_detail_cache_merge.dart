part of 'task_board_detail_cubit.dart';

Map<String, List<TaskBoardTask>> _mergeTaskListSnapshots(
  Map<String, List<TaskBoardTask>> base,
  Map<String, List<TaskBoardTask>> overlay,
) {
  if (base.isEmpty) return overlay;
  if (overlay.isEmpty) return base;
  final authoritativeListByTaskId = <String, String>{
    for (final entry in base.entries)
      for (final task in entry.value) task.id: entry.key,
  };
  return Map<String, List<TaskBoardTask>>.unmodifiable({
    ...base,
    for (final entry in overlay.entries)
      entry.key: List<TaskBoardTask>.unmodifiable(
        entry.value.where(
          (task) =>
              task.listId == entry.key &&
              (authoritativeListByTaskId[task.id] == null ||
                  authoritativeListByTaskId[task.id] == entry.key),
        ),
      ),
  });
}
