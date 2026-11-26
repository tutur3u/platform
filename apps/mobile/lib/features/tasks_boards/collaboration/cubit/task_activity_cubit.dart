import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_snapshot.dart';

class TaskActivityState extends Equatable {
  const TaskActivityState({
    this.load = CollabLoad.loading,
    this.events = const [],
    this.loadFailure,
    this.nextCursor,
    this.loadingMore = false,
  });

  final CollabLoad load;
  final List<TaskTimelineEvent> events;
  final CollabFailure? loadFailure;
  final String? nextCursor;
  final bool loadingMore;

  bool get hasMore => nextCursor != null;

  TaskActivityState copyWith({
    CollabLoad? load,
    List<TaskTimelineEvent>? events,
    CollabFailure? loadFailure,
    bool clearLoadFailure = false,
    String? nextCursor,
    bool clearCursor = false,
    bool? loadingMore,
  }) => TaskActivityState(
    load: load ?? this.load,
    events: events ?? this.events,
    loadFailure: clearLoadFailure ? null : loadFailure ?? this.loadFailure,
    nextCursor: clearCursor ? null : nextCursor ?? this.nextCursor,
    loadingMore: loadingMore ?? this.loadingMore,
  );

  @override
  List<Object?> get props => [
    load,
    events,
    loadFailure,
    nextCursor,
    loadingMore,
  ];
}

/// The task's merged timeline (history, comments and links), newest first,
/// 50 events a page as web reads it.
class TaskActivityCubit extends Cubit<TaskActivityState> {
  TaskActivityCubit({
    required TaskCollaborationRepository repository,
    required this.wsId,
    required this.taskId,
  }) : _repository = repository,
       super(const TaskActivityState());

  final TaskCollaborationRepository _repository;
  final String wsId;
  final String taskId;
  int _generation = 0;

  Future<void> load() async {
    final generation = ++_generation;
    emit(state.copyWith(load: CollabLoad.loading, clearLoadFailure: true));
    try {
      final page = await _repository.listTimeline(wsId, taskId);
      if (isClosed || generation != _generation) return;
      emit(
        TaskActivityState(
          load: CollabLoad.loaded,
          events: page.items,
          nextCursor: page.nextCursor,
        ),
      );
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      emit(
        state.copyWith(
          load: CollabLoad.failed,
          loadFailure: collabFailureOf(error),
        ),
      );
    }
  }

  /// Appends the next page; a reload started meanwhile wins.
  Future<CollabFailure?> loadMore() async {
    final cursor = state.nextCursor;
    if (cursor == null || state.loadingMore) return null;
    final generation = _generation;
    emit(state.copyWith(loadingMore: true));
    try {
      final page = await _repository.listTimeline(wsId, taskId, cursor: cursor);
      if (isClosed || generation != _generation) return null;
      final seen = {for (final event in state.events) event.id};
      emit(
        state.copyWith(
          events: [
            ...state.events,
            for (final event in page.items)
              if (!seen.contains(event.id)) event,
          ],
          nextCursor: page.nextCursor,
          clearCursor: page.nextCursor == null,
          loadingMore: false,
        ),
      );
      return null;
    } on Object catch (error) {
      if (!isClosed && generation == _generation) {
        emit(state.copyWith(loadingMore: false));
      }
      return collabFailureOf(error);
    }
  }
}

class TaskRevertState extends Equatable {
  const TaskRevertState({
    this.load = CollabLoad.loading,
    this.snapshot,
    this.changed = const [],
    this.selected = const {},
    this.loadFailure,
    this.reverting = false,
  });

  final CollabLoad load;
  final TaskSnapshot? snapshot;

  /// Fields that differ between the snapshot and the task now.
  final List<TaskRevertField> changed;
  final Set<TaskRevertField> selected;
  final CollabFailure? loadFailure;
  final bool reverting;

  TaskRevertState copyWith({
    CollabLoad? load,
    TaskSnapshot? snapshot,
    List<TaskRevertField>? changed,
    Set<TaskRevertField>? selected,
    CollabFailure? loadFailure,
    bool? reverting,
  }) => TaskRevertState(
    load: load ?? this.load,
    snapshot: snapshot ?? this.snapshot,
    changed: changed ?? this.changed,
    selected: selected ?? this.selected,
    loadFailure: loadFailure ?? this.loadFailure,
    reverting: reverting ?? this.reverting,
  );

  @override
  List<Object?> get props => [
    load,
    snapshot,
    changed,
    selected,
    loadFailure,
    reverting,
  ];
}

/// Restoring a task from one history entry, as web's snapshot dialog does:
/// the fields that differ from the task now start selected, and the revert
/// sends only the selected ones.
class TaskRevertCubit extends Cubit<TaskRevertState> {
  TaskRevertCubit({
    required TaskCollaborationRepository repository,
    required this.wsId,
    required this.task,
    required this.historyId,
  }) : _repository = repository,
       super(const TaskRevertState());

  final TaskCollaborationRepository _repository;
  final String wsId;
  final TaskBoardTask task;
  final String historyId;

  Future<void> load() async {
    emit(const TaskRevertState());
    try {
      final snapshot = await _repository.snapshot(wsId, task.id, historyId);
      if (isClosed) return;
      final changed = snapshot.changedFrom(task);
      emit(
        TaskRevertState(
          load: CollabLoad.loaded,
          snapshot: snapshot,
          changed: changed,
          selected: changed.toSet(),
        ),
      );
    } on Object catch (error) {
      if (isClosed) return;
      emit(
        state.copyWith(
          load: CollabLoad.failed,
          loadFailure: collabFailureOf(error),
        ),
      );
    }
  }

  void toggle(TaskRevertField field) {
    if (state.reverting) return;
    final next = {...state.selected};
    next.contains(field) ? next.remove(field) : next.add(field);
    emit(state.copyWith(selected: next));
  }

  void selectAll(bool all) {
    if (state.reverting) return;
    emit(state.copyWith(selected: all ? state.changed.toSet() : const {}));
  }

  /// Reverts the selected fields in web's order.
  Future<CollabFailure?> revert() async {
    if (state.selected.isEmpty || state.reverting) return null;
    emit(state.copyWith(reverting: true));
    final fields = [
      for (final field in TaskRevertField.values)
        if (state.selected.contains(field)) field,
    ];
    final failure = await attemptCollab(
      () => _repository.revert(wsId, task.id, historyId, fields),
    );
    if (!isClosed) emit(state.copyWith(reverting: false));
    return failure;
  }
}
