import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';

/// Whether [value] is an https address, the only kind the links route takes.
bool isHttpsLink(String value) {
  final uri = Uri.tryParse(value.trim());
  return uri != null && uri.scheme == 'https' && uri.host.isNotEmpty;
}

class TaskLinksState extends Equatable {
  const TaskLinksState({
    this.load = CollabLoad.loading,
    this.links = const [],
    this.loadFailure,
    this.adding = false,
    this.removingId,
  });

  final CollabLoad load;
  final List<TaskLink> links;
  final CollabFailure? loadFailure;
  final bool adding;
  final String? removingId;

  /// Links grouped by kind in web's order, empty kinds left out.
  List<(TaskLinkKind, List<TaskLink>)> get groups => [
    for (final kind in TaskLinkKind.values)
      if (links.where((link) => link.kind == kind).toList() case final group
          when group.isNotEmpty)
        (kind, group),
  ];

  TaskLinksState copyWith({
    CollabLoad? load,
    List<TaskLink>? links,
    CollabFailure? loadFailure,
    bool clearLoadFailure = false,
    bool? adding,
    String? removingId,
    bool clearRemoving = false,
  }) => TaskLinksState(
    load: load ?? this.load,
    links: links ?? this.links,
    loadFailure: clearLoadFailure ? null : loadFailure ?? this.loadFailure,
    adding: adding ?? this.adding,
    removingId: clearRemoving ? null : removingId ?? this.removingId,
  );

  @override
  List<Object?> get props => [load, links, loadFailure, adding, removingId];
}

/// A task's linked resources. Adding the same address again updates the
/// existing link on the server, so the list replaces it by address.
class TaskLinksCubit extends Cubit<TaskLinksState> {
  TaskLinksCubit({
    required TaskCollaborationRepository repository,
    required this.wsId,
    required this.taskId,
  }) : _repository = repository,
       super(const TaskLinksState());

  final TaskCollaborationRepository _repository;
  final String wsId;
  final String taskId;

  Future<void> load() async {
    emit(state.copyWith(load: CollabLoad.loading, clearLoadFailure: true));
    try {
      final links = await _repository.listLinks(wsId, taskId);
      if (isClosed) return;
      emit(state.copyWith(load: CollabLoad.loaded, links: links));
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

  /// Adds [url]; returns [CollabFailure.invalid] without a request when it
  /// is not an https address.
  Future<CollabFailure?> add(String url) async {
    final address = url.trim();
    if (!isHttpsLink(address)) return CollabFailure.invalid;
    if (state.adding) return null;
    emit(state.copyWith(adding: true));
    final failure = await attemptCollab(() async {
      final link = await _repository.addLink(wsId, taskId, address);
      if (isClosed) return;
      emit(
        state.copyWith(
          links: [
            for (final existing in state.links)
              if (existing.url != link.url) existing,
            link,
          ],
        ),
      );
    });
    if (!isClosed) emit(state.copyWith(adding: false));
    return failure;
  }

  Future<CollabFailure?> remove(TaskLink link) async {
    final id = link.id;
    if (!link.removable || id == null || state.removingId != null) {
      return null;
    }
    emit(state.copyWith(removingId: id));
    final failure = await attemptCollab(() async {
      await _repository.removeLink(wsId, taskId, id);
      if (isClosed) return;
      emit(
        state.copyWith(
          links: [
            for (final existing in state.links)
              if (existing.id != id) existing,
          ],
        ),
      );
    });
    if (!isClosed) emit(state.copyWith(clearRemoving: true));
    return failure;
  }
}
