import 'dart:async';
import 'dart:io';

import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

/// Manages workspace selection, listing, and creation.
class WorkspaceCubit extends Cubit<WorkspaceState> {
  WorkspaceCubit({required WorkspaceRepository workspaceRepository})
    : _repo = workspaceRepository,
      super(const WorkspaceState());

  final WorkspaceRepository _repo;

  /// Loads workspaces and resolves the default workspace.
  ///
  /// Resolution order:
  /// 1. Server-side default (`user_private_details.default_workspace_id`)
  /// 2. Local default workspace cache (offline fallback)
  /// 3. SharedPreferences cache for the current session workspace
  /// 4. Auto-select if only one workspace exists
  Future<void> loadWorkspaces() async {
    emit(state.copyWith(status: WorkspaceStatus.loading));

    try {
      final workspaces = await _repo.getWorkspaces();

      Workspace? current;
      Workspace? defaultWorkspace;

      // 1. Try server-side default
      final serverDefault = await _repo.getDefaultWorkspace();
      if (serverDefault != null) {
        defaultWorkspace = workspaces
            .where((w) => w.id == serverDefault.id)
            .firstOrNull;
      }

      // 2. Fallback to local default cache
      if (defaultWorkspace == null) {
        final localDefaultId = await _repo.loadDefaultWorkspaceId();
        if (localDefaultId != null) {
          defaultWorkspace = workspaces
              .where((w) => w.id == localDefaultId)
              .firstOrNull;
        }
      }

      // 3. Fallback to SharedPreferences cache for current session
      final saved = await _repo.loadSelectedWorkspace();
      if (saved != null) {
        current = workspaces.where((w) => w.id == saved.id).firstOrNull;
      }

      // 4. Otherwise use the resolved default workspace
      current ??= defaultWorkspace;

      // 5. Fallback to personal workspace
      defaultWorkspace ??= workspaces.where((w) => w.personal).firstOrNull;
      current ??= defaultWorkspace;

      // 6. Auto-select if only one workspace
      current ??= workspaces.length == 1 ? workspaces.first : null;
      defaultWorkspace ??= current;

      emit(
        state.copyWith(
          status: WorkspaceStatus.loaded,
          workspaces: workspaces,
          currentWorkspace: current,
          defaultWorkspace: defaultWorkspace,
        ),
      );

      // Load limits in background (non-blocking)
      unawaited(_loadLimits());
    } on Exception catch (e) {
      emit(
        state.copyWith(
          status: WorkspaceStatus.error,
          error: e.toString(),
        ),
      );
    }
  }

  /// Selects the active workspace for the current device/session.
  Future<void> selectWorkspace(Workspace workspace) async {
    emit(state.copyWith(currentWorkspace: workspace));
    await _repo.saveSelectedWorkspace(workspace);
  }

  Future<void> setDefaultWorkspace(Workspace workspace) async {
    await _repo.updateDefaultWorkspace(workspace.id);
    emit(state.copyWith(defaultWorkspace: workspace));
  }

  /// Creates a new workspace and adds it to the list.
  ///
  /// Returns the created workspace, or throws on failure.
  Future<Workspace> createWorkspace(String name, {File? avatarFile}) async {
    emit(state.copyWith(isCreating: true));

    try {
      final workspace = await _repo.createWorkspace(
        name,
        avatarFile: avatarFile,
      );

      emit(
        state.copyWith(
          isCreating: false,
          workspaces: [...state.workspaces, workspace],
        ),
      );

      // Refresh limits after creation
      unawaited(_loadLimits());

      return workspace;
    } on Exception {
      emit(state.copyWith(isCreating: false));
      rethrow;
    }
  }

  /// Refreshes workspace creation limits.
  Future<void> refreshLimits() => _loadLimits();

  Future<void> _loadLimits() async {
    try {
      final limits = await _repo.getWorkspaceLimits();
      emit(state.copyWith(limits: limits));
    } on Exception catch (_) {
      // Non-critical — UI shows create button without limit info
    }
  }

  /// Clears workspace selection (on logout).
  Future<void> clearWorkspaces() async {
    await _repo.clearSelectedWorkspace();
    emit(const WorkspaceState());
  }
}
