import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_sharing_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_sharing_models.dart';

final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

/// A plausible email address, checked before an invite is sent.
bool isShareEmail(String value) => _email.hasMatch(value.trim());

/// What a sharing sheet shows: its link and the people it is shared with.
/// [L] is the task's share link or the board's public link.
class SharingState<L> extends Equatable {
  const SharingState({
    this.load = CollabLoad.loading,
    this.link,
    this.shares = const [],
    this.loadFailure,
    this.busy = false,
  });

  final CollabLoad load;
  final L? link;
  final List<ShareGrant> shares;
  final CollabFailure? loadFailure;

  /// A change is being saved; controls wait for it.
  final bool busy;

  SharingState<L> copyWith({
    CollabLoad? load,
    L? link,
    bool clearLink = false,
    List<ShareGrant>? shares,
    CollabFailure? loadFailure,
    bool? busy,
  }) => SharingState<L>(
    load: load ?? this.load,
    link: clearLink ? null : link ?? this.link,
    shares: shares ?? this.shares,
    loadFailure: loadFailure ?? this.loadFailure,
    busy: busy ?? this.busy,
  );

  @override
  List<Object?> get props => [load, link, shares, loadFailure, busy];
}

/// Shared mechanics: one change at a time, and the sheet reloads after a
/// change so it shows what the server stored.
abstract class _SharingCubit<L> extends Cubit<SharingState<L>> {
  _SharingCubit() : super(SharingState<L>());

  Future<(L?, List<ShareGrant>)> fetch();

  Future<void> load() async {
    emit(SharingState<L>());
    try {
      final (link, shares) = await fetch();
      if (isClosed) return;
      emit(
        SharingState<L>(load: CollabLoad.loaded, link: link, shares: shares),
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

  Future<CollabFailure?> change(Future<void> Function() action) async {
    if (state.busy) return null;
    emit(state.copyWith(busy: true));
    final failure = await attemptCollab(() async {
      await action();
      final (link, shares) = await fetch();
      if (isClosed) return;
      emit(state.copyWith(link: link, clearLink: link == null, shares: shares));
    });
    if (!isClosed) emit(state.copyWith(busy: false));
    return failure;
  }

  /// Invites [email]; an address that is not an email returns
  /// [CollabFailure.invalid] without a request.
  Future<CollabFailure?> invite(
    String email,
    Future<void> Function(String email) send,
  ) async {
    final address = email.trim();
    if (!isShareEmail(address)) return CollabFailure.invalid;
    return await change(() => send(address));
  }
}

/// A task's share link and the people the task is shared with.
class TaskSharingCubit extends _SharingCubit<TaskShareLink> {
  TaskSharingCubit({
    required TaskSharingRepository repository,
    required this.wsId,
    required this.taskId,
  }) : _repository = repository;

  final TaskSharingRepository _repository;
  final String wsId;
  final String taskId;

  @override
  Future<(TaskShareLink?, List<ShareGrant>)> fetch() async {
    final results = await Future.wait<Object>([
      _repository.taskShareLink(wsId, taskId),
      _repository.taskShares(wsId, taskId),
    ]);
    return (results[0] as TaskShareLink, results[1] as List<ShareGrant>);
  }

  String? get shareUrl => switch (state.link) {
    final link? => _repository.taskShareUrl(link.code),
    null => null,
  };

  Future<CollabFailure?> setPublicAccess(bool enabled) => change(
    () => _repository.updateTaskShareLink(wsId, taskId, publicAccess: enabled),
  );

  Future<CollabFailure?> setInviteOnly(bool enabled) => change(
    () =>
        _repository.updateTaskShareLink(wsId, taskId, requiresInvite: enabled),
  );

  /// Revokes the link; reading it again issues a new code.
  Future<CollabFailure?> revokeLink() async {
    final link = state.link;
    if (link == null) return null;
    return await change(
      () => _repository.revokeTaskShareLink(wsId, taskId, link.id),
    );
  }

  Future<CollabFailure?> addPerson(String email) => invite(
    email,
    (address) => _repository.addTaskShare(wsId, taskId, address),
  );

  Future<CollabFailure?> setPermission(
    String shareId,
    SharePermission permission,
  ) => change(
    () => _repository.updateTaskShare(wsId, taskId, shareId, permission),
  );

  Future<CollabFailure?> removePerson(String shareId) =>
      change(() => _repository.removeTaskShare(wsId, taskId, shareId));
}

/// A board's public link and its direct guests.
class BoardSharingCubit extends _SharingCubit<BoardPublicLink> {
  BoardSharingCubit({
    required TaskSharingRepository repository,
    required this.wsId,
    required this.boardId,
    required this.locale,
  }) : _repository = repository;

  final TaskSharingRepository _repository;
  final String wsId;
  final String boardId;

  /// The locale the public board address opens in.
  final String locale;

  @override
  Future<(BoardPublicLink?, List<ShareGrant>)> fetch() async {
    final results = await Future.wait<Object?>([
      _repository.boardPublicLink(wsId, boardId),
      _repository.boardShares(wsId, boardId),
    ]);
    return (results[0] as BoardPublicLink?, results[1]! as List<ShareGrant>);
  }

  String? get publicUrl => switch (state.link) {
    final link? => _repository.boardPublicUrl(link.code, locale: locale),
    null => null,
  };

  Future<CollabFailure?> enablePublicLink() =>
      change(() => _repository.enableBoardPublicLink(wsId, boardId));

  Future<CollabFailure?> disablePublicLink() =>
      change(() => _repository.disableBoardPublicLink(wsId, boardId));

  Future<CollabFailure?> addGuest(String email, SharePermission permission) =>
      invite(
        email,
        (address) =>
            _repository.addBoardShare(wsId, boardId, address, permission),
      );

  Future<CollabFailure?> setPermission(
    String shareId,
    SharePermission permission,
  ) => change(
    () => _repository.updateBoardShare(wsId, boardId, shareId, permission),
  );

  Future<CollabFailure?> removeGuest(String shareId) =>
      change(() => _repository.removeBoardShare(wsId, boardId, shareId));
}
