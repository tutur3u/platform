import 'dart:async';
import 'dart:io';

import 'package:bloc/bloc.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
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
  Future<void> loadWorkspaces({bool forceRefresh = false}) async {
    final cached = forceRefresh
        ? const CacheReadResult<List<Workspace>>(state: CacheEntryState.missing)
        : await _repo.readCachedWorkspaces();
    final hasCachedWorkspaces = cached.hasValue && cached.data != null;

    if (hasCachedWorkspaces) {
      emit(
        await _buildResolvedState(
          cached.data!,
          status: WorkspaceStatus.loaded,
          includeServerDefault: false,
        ),
      );

      if (cached.isFresh) {
        unawaited(_loadLimits());
        return;
      }
    } else {
      emit(
        state.copyWith(
          status: WorkspaceStatus.loading,
          error: null,
        ),
      );
    }

    try {
      final workspaces = await _repo.getWorkspaces();
      emit(
        await _buildResolvedState(
          workspaces,
          status: WorkspaceStatus.loaded,
          includeServerDefault: true,
        ),
      );

      // Load limits in background (non-blocking)
      unawaited(_loadLimits());
    } on Exception catch (e) {
      if (hasCachedWorkspaces) {
        return;
      }
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
  /// Returns the creation result, or throws on failure.
  Future<WorkspaceCreationResult> createWorkspace(
    String name, {
    File? avatarFile,
  }) async {
    emit(state.copyWith(isCreating: true));

    try {
      final result = await _repo.createWorkspace(
        name,
        avatarFile: avatarFile,
      );

      emit(
        state.copyWith(
          isCreating: false,
          workspaces: [...state.workspaces, result.workspace],
        ),
      );
      await _repo.saveCachedWorkspaces(state.workspaces);

      // Refresh limits after creation
      unawaited(_loadLimits());

      return result;
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

  Future<WorkspaceState> _buildResolvedState(
    List<Workspace> workspaces, {
    required WorkspaceStatus status,
    required bool includeServerDefault,
  }) async {
    Workspace? current;
    Workspace? defaultWorkspace;

    if (includeServerDefault) {
      final serverDefault = await _repo.getDefaultWorkspace();
      if (serverDefault != null) {
        defaultWorkspace = workspaces
            .where((workspace) => workspace.id == serverDefault.id)
            .firstOrNull;
      }
    }

    if (defaultWorkspace == null) {
      final localDefaultId = await _repo.loadDefaultWorkspaceId();
      if (localDefaultId != null) {
        defaultWorkspace = workspaces
            .where((workspace) => workspace.id == localDefaultId)
            .firstOrNull;
      }
    }

    final saved = await _repo.loadSelectedWorkspace();
    if (saved != null) {
      current = workspaces
          .where((workspace) => workspace.id == saved.id)
          .firstOrNull;
    }

    current ??= defaultWorkspace;
    defaultWorkspace ??= workspaces
        .where((workspace) => workspace.personal)
        .firstOrNull;
    current ??= defaultWorkspace;
    current ??= workspaces.length == 1 ? workspaces.first : null;
    defaultWorkspace ??= current;

    return state.copyWith(
      status: status,
      workspaces: workspaces,
      currentWorkspace: current,
      defaultWorkspace: defaultWorkspace,
      error: null,
    );
  }
}
