import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

/// Manages workspace selection and listing.
///
/// Ported from apps/native/lib/stores/workspace-store.ts (Zustand → Cubit).
class WorkspaceCubit extends Cubit<WorkspaceState> {
  WorkspaceCubit({required WorkspaceRepository workspaceRepository})
    : _repo = workspaceRepository,
      super(const WorkspaceState());

  final WorkspaceRepository _repo;

  /// Loads workspaces and restores the last selected workspace.
  Future<void> loadWorkspaces() async {
    emit(state.copyWith(status: WorkspaceStatus.loading));

    try {
      final workspaces = await _repo.getWorkspaces();
      final saved = await _repo.loadSelectedWorkspace();

      // Restore saved workspace if it still exists in the list
      Workspace? current;
      if (saved != null) {
        current = workspaces.where((w) => w.id == saved.id).firstOrNull;
      }

      // Auto-select first if only one workspace
      current ??= workspaces.length == 1 ? workspaces.first : null;

      emit(
        state.copyWith(
          status: WorkspaceStatus.loaded,
          workspaces: workspaces,
          currentWorkspace: current,
        ),
      );
    } on Exception catch (e) {
      emit(
        state.copyWith(
          status: WorkspaceStatus.error,
          error: e.toString(),
        ),
      );
    }
  }

  /// Selects a workspace and persists the choice.
  Future<void> selectWorkspace(Workspace workspace) async {
    emit(state.copyWith(currentWorkspace: workspace));
    await _repo.saveSelectedWorkspace(workspace);
  }

  /// Clears workspace selection (on logout).
  Future<void> clearWorkspaces() async {
    await _repo.clearSelectedWorkspace();
    emit(const WorkspaceState());
  }
}
