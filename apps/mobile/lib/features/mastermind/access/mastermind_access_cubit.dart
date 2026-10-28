import 'package:bloc/bloc.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_state.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';

export 'mastermind_access_state.dart';

/// Cosmetic discovery gate. This does not grant server authorization.
///
/// Mastermind shows in the root workspace and in the user's personal
/// workspace, and only when the user holds `manage_mastermind` in root (an
/// explicit grant; creator and admin access never imply it).
final class MastermindAccessCubit extends Cubit<MastermindAccessState> {
  MastermindAccessCubit({
    required WorkspacePermissionsRepository repository,
    required MastermindSnapshotSource source,
    bool Function(String wsId)? isPersonalWorkspace,
  }) : _repository = repository,
       _source = source,
       _isPersonalWorkspace = isPersonalWorkspace ?? _never,
       super(const MastermindAccessState());

  final WorkspacePermissionsRepository _repository;
  final MastermindSnapshotSource _source;
  final bool Function(String wsId) _isPersonalWorkspace;

  static bool _never(String _) => false;

  bool _offersMastermind(String wsId) =>
      isSystemWorkspaceId(wsId) || _isPersonalWorkspace(wsId);
  int _generation = 0;

  /// Re-checks access for [wsId]. A [quiet] sync keeps the current answer on
  /// screen while it runs, so a pull-to-refresh never makes the entry blink.
  Future<void> sync(String? wsId, {bool quiet = false}) async {
    final generation = ++_generation;
    final keep =
        quiet &&
        state.status == MastermindAccessStatus.loaded &&
        state.wsId == wsId;
    if (wsId == null || !_offersMastermind(wsId) || !_source.isConfigured) {
      emit(
        MastermindAccessState(
          status: MastermindAccessStatus.loaded,
          wsId: wsId,
        ),
      );
      return;
    }
    if (!keep) {
      emit(
        MastermindAccessState(
          status: MastermindAccessStatus.loading,
          wsId: wsId,
        ),
      );
    }
    try {
      final permissions = await _repository.getPermissions(
        wsId: rootWorkspaceId,
      );
      if (isClosed || generation != _generation) return;
      emit(
        MastermindAccessState(
          status: MastermindAccessStatus.loaded,
          wsId: wsId,
          enabled:
              permissions.containsPermission(manageMastermindPermission) &&
              _source.isConfigured,
        ),
      );
    } on Object {
      if (isClosed || generation != _generation || keep) return;
      emit(
        MastermindAccessState(status: MastermindAccessStatus.error, wsId: wsId),
      );
    }
  }

  Future<void> syncWorkspace(String? wsId) => sync(wsId);

  /// The hub said 403: hide the entry until the next [sync].
  void markForbidden() {
    if (isClosed || state.status != MastermindAccessStatus.loaded) return;
    if (state.forbidden) return;
    emit(
      MastermindAccessState(
        status: state.status,
        enabled: state.enabled,
        forbidden: true,
        wsId: state.wsId,
      ),
    );
  }
}
