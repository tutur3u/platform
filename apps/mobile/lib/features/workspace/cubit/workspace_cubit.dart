import 'dart:async';

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

  /// Loads workspaces and resolves the default workspace.
  ///
  /// Resolution order:
  /// 1. Server-side default (`user_private_details.default_workspace_id`)
  /// 2. SharedPreferences cache (offline fallback)
  /// 3. Auto-select if only one workspace exists
  Future<void> loadWorkspaces() async {
    emit(state.copyWith(status: WorkspaceStatus.loading));

    try {
      final workspaces = await _repo.getWorkspaces();

      Workspace? current;

      // 1. Try server-side default
      final serverDefault = await _repo.getDefaultWorkspace();
      if (serverDefault != null) {
        current = workspaces.where((w) => w.id == serverDefault.id).firstOrNull;
      }

      // 2. Fallback to SharedPreferences cache
      if (current == null) {
        final saved = await _repo.loadSelectedWorkspace();
        if (saved != null) {
          current = workspaces.where((w) => w.id == saved.id).firstOrNull;
        }
      }

      // 3. Auto-select if only one workspace
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

  /// Selects a workspace, persists locally, and syncs to server.
  Future<void> selectWorkspace(Workspace workspace) async {
    emit(state.copyWith(currentWorkspace: workspace));
    await _repo.saveSelectedWorkspace(workspace);

    // Fire-and-forget server-side sync
    unawaited(_repo.updateDefaultWorkspace(workspace.id));
  }

  /// Clears workspace selection (on logout).
  Future<void> clearWorkspaces() async {
    await _repo.clearSelectedWorkspace();
    emit(const WorkspaceState());
  }
}
