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

TaskBoardDetail _decodeBoardDetailCache(Object? json) {
  if (json is! Map) {
    throw const FormatException('Invalid task board detail cache payload.');
  }
  return TaskBoardDetail.fromJson(Map<String, dynamic>.from(json));
}

List<TaskBoardTask> _decodeListTasksCache(Object? json) {
  if (json is! List<dynamic>) {
    throw const FormatException('Invalid task board list cache payload.');
  }
  return json
      .whereType<Map<String, dynamic>>()
      .map(TaskBoardTask.fromJson)
      .toList(growable: false);
}

CacheKey _detailCacheKey({required String wsId, required String boardId}) {
  return CacheKey(
    namespace: 'tasks.board_detail',
    userId: currentCacheUserId(),
    workspaceId: wsId,
    locale: currentCacheLocaleTag(),
    schemaVersion: 2,
    params: {'boardId': boardId},
  );
}
