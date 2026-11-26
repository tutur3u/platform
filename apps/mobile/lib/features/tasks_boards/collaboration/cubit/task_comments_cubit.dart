import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';

class TaskCommentsState extends Equatable {
  const TaskCommentsState({
    this.load = CollabLoad.loading,
    this.comments = const [],
    this.loadFailure,
    this.posting = false,
    this.busyCommentId,
  });

  final CollabLoad load;
  final List<TaskComment> comments;
  final CollabFailure? loadFailure;

  /// A new comment is being sent.
  final bool posting;

  /// The comment being edited or deleted.
  final String? busyCommentId;

  TaskCommentsState copyWith({
    CollabLoad? load,
    List<TaskComment>? comments,
    CollabFailure? loadFailure,
    bool clearLoadFailure = false,
    bool? posting,
    String? busyCommentId,
    bool clearBusy = false,
  }) => TaskCommentsState(
    load: load ?? this.load,
    comments: comments ?? this.comments,
    loadFailure: clearLoadFailure ? null : loadFailure ?? this.loadFailure,
    posting: posting ?? this.posting,
    busyCommentId: clearBusy ? null : busyCommentId ?? this.busyCommentId,
  );

  @override
  List<Object?> get props => [
    load,
    comments,
    loadFailure,
    posting,
    busyCommentId,
  ];
}

/// A task's comments, oldest first. Writes go to the server first and the
/// list changes only with its answer, so a failed write leaves nothing
/// pretending to be saved.
class TaskCommentsCubit extends Cubit<TaskCommentsState> {
  TaskCommentsCubit({
    required TaskCollaborationRepository repository,
    required this.wsId,
    required this.taskId,
  }) : _repository = repository,
       super(const TaskCommentsState());

  final TaskCollaborationRepository _repository;
  final String wsId;
  final String taskId;

  Future<void> load() async {
    emit(state.copyWith(load: CollabLoad.loading, clearLoadFailure: true));
    try {
      final comments = await _repository.listComments(wsId, taskId);
      if (isClosed) return;
      emit(state.copyWith(load: CollabLoad.loaded, comments: comments));
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

  Future<CollabFailure?> add(String body) async {
    final text = body.trim();
    if (text.isEmpty || state.posting) return null;
    emit(state.copyWith(posting: true));
    final failure = await attemptCollab(() async {
      final comment = await _repository.addComment(wsId, taskId, text);
      if (isClosed) return;
      emit(state.copyWith(comments: [...state.comments, comment]));
    });
    if (!isClosed) emit(state.copyWith(posting: false));
    return failure;
  }

  Future<CollabFailure?> edit(String commentId, String body) async {
    final text = body.trim();
    if (text.isEmpty || state.busyCommentId != null) return null;
    emit(state.copyWith(busyCommentId: commentId));
    final failure = await attemptCollab(() async {
      final updated = await _repository.editComment(
        wsId,
        taskId,
        commentId,
        text,
      );
      if (isClosed) return;
      emit(
        state.copyWith(
          comments: [
            for (final comment in state.comments)
              if (comment.id == commentId) updated else comment,
          ],
        ),
      );
    });
    if (!isClosed) emit(state.copyWith(clearBusy: true));
    return failure;
  }

  Future<CollabFailure?> delete(String commentId) async {
    if (state.busyCommentId != null) return null;
    emit(state.copyWith(busyCommentId: commentId));
    final failure = await attemptCollab(() async {
      await _repository.deleteComment(wsId, taskId, commentId);
      if (isClosed) return;
      emit(
        state.copyWith(
          comments: [
            for (final comment in state.comments)
              if (comment.id != commentId) comment,
          ],
        ),
      );
    });
    if (!isClosed) emit(state.copyWith(clearBusy: true));
    return failure;
  }
}
