part of 'task_repository.dart';

/// Bounds for the reads behind a board detail.
class TaskBoardDetailLoadPolicy {
  const TaskBoardDetailLoadPolicy({
    this.requestTimeout = const Duration(seconds: 20),
    this.retryDelay = const Duration(milliseconds: 800),
  });

  /// Limit for each request; a slow request fails instead of holding the
  /// board on its loading state.
  final Duration requestTimeout;

  /// Wait before the single retry of the board metadata and list reads.
  final Duration retryDelay;
}

/// Reads the board metadata and lists, which the board needs, together with
/// its workspace parts, which it can show without.
///
/// The required reads retry once after a timeout, transport failure or server
/// error. A failed or timed-out part resolves empty and is reported in
/// [TaskBoardDetail.unavailableParts].
Future<TaskBoardDetail> _loadTaskBoardDetail(
  TaskRepository repository,
  String wsId,
  String boardId,
) async {
  final policy = repository._boardDetailLoadPolicy;
  final parts = _readTaskBoardDetailParts(
    repository,
    wsId,
    boardId,
    TaskBoardDetailPart.values.toSet(),
  );
  final required = await Future.wait<dynamic>([
    _requiredBoardRead(
      () => _getTaskBoardMetadata(repository, wsId, boardId),
      policy,
    ),
    _requiredBoardRead(() => repository.getBoardLists(wsId, boardId), policy),
  ]);
  final metadata = (required[0] as TaskBoardDetail).copyWith(
    lists: required[1] as List<TaskBoardList>,
    tasks: const <TaskBoardTask>[],
  );
  return (await parts)(metadata);
}

/// Reads the unavailable parts of [detail] again and returns it with every
/// part that loaded filled in and removed from its unavailable parts.
Future<TaskBoardDetail> _reloadTaskBoardDetailParts(
  TaskRepository repository,
  TaskBoardDetail detail,
) async {
  final apply = await _readTaskBoardDetailParts(
    repository,
    detail.wsId,
    detail.id,
    detail.unavailableParts,
  );
  return apply(detail);
}

/// Starts the reads for [parts] and resolves to a function that applies the
/// results to a board, so the parts load alongside the required reads.
Future<TaskBoardDetail Function(TaskBoardDetail)> _readTaskBoardDetailParts(
  TaskRepository repository,
  String wsId,
  String boardId,
  Set<TaskBoardDetailPart> parts,
) async {
  final timeout = repository._boardDetailLoadPolicy.requestTimeout;
  Future<T?> read<T>(TaskBoardDetailPart part, Future<T> Function() load) =>
      parts.contains(part)
      ? _optionalBoardRead(part, load, timeout)
      : Future<T?>.value();

  final results = await Future.wait<Object?>([
    read(TaskBoardDetailPart.labels, () => repository.getTaskLabels(wsId)),
    read(TaskBoardDetailPart.members, () => repository.getWorkspaceUsers(wsId)),
    read(TaskBoardDetailPart.projects, () => repository.getTaskProjects(wsId)),
    read(
      TaskBoardDetailPart.estimation,
      () => repository.getTaskEstimateBoards(wsId),
    ),
  ]);
  final labels = results[0] as List<TaskLabel>?;
  final members = results[1] as List<WorkspaceUserOption>?;
  final projects = results[2] as List<TaskProjectSummary>?;
  final estimateBoards = results[3] as List<TaskEstimateBoard>?;

  TaskBoardDetail apply(TaskBoardDetail detail) {
    final unavailable = {
      for (final part in parts)
        if (results[part.index] == null) part,
    };
    TaskEstimateBoard? estimation;
    for (final board in estimateBoards ?? const <TaskEstimateBoard>[]) {
      if (board.id == boardId) {
        estimation = board;
        break;
      }
    }
    final loaded = estimateBoards == null
        ? detail
        : detail.copyWith(
            estimationType: estimation?.estimationType,
            extendedEstimation: estimation?.extendedEstimation ?? false,
            allowZeroEstimates: estimation?.allowZeroEstimates ?? true,
            countUnestimatedIssues: estimation?.countUnestimatedIssues ?? false,
          );
    return loaded.copyWith(
      labels: labels,
      members: members,
      projects: projects,
      unavailableParts: {
        ...detail.unavailableParts.difference(parts),
        ...unavailable,
      },
    );
  }

  return apply;
}

Future<T> _requiredBoardRead<T>(
  Future<T> Function() read,
  TaskBoardDetailLoadPolicy policy,
) async {
  try {
    return await read().timeout(policy.requestTimeout);
  } on Exception catch (error) {
    if (!_isRetryableBoardReadFailure(error)) rethrow;
  }
  await Future<void>.delayed(policy.retryDelay);
  return await read().timeout(policy.requestTimeout);
}

/// A client error such as a missing board or denied access fails the same way
/// again, so only timeouts, transport failures and server errors retry.
bool _isRetryableBoardReadFailure(Exception error) => switch (error) {
  ApiException(failureKind: ApiFailureKind.transport) => true,
  ApiException(:final statusCode) =>
    statusCode == 0 ||
        statusCode == 408 ||
        statusCode == 429 ||
        statusCode >= 500,
  _ => true,
};

Future<T?> _optionalBoardRead<T>(
  TaskBoardDetailPart part,
  Future<T> Function() read,
  Duration timeout,
) async {
  try {
    return await read().timeout(timeout);
  } on Object catch (error) {
    developer.log(
      'Board ${part.name} unavailable: $error',
      name: 'TaskRepository',
    );
    return null;
  }
}
