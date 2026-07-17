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
  int _loadRequestToken = 0;
  int _selectionRevision = 0;

  /// Loads workspaces and resolves the default workspace.
  ///
  /// Resolution order:
  /// 1. Server-side default (`user_private_details.default_workspace_id`)
  /// 2. Local default workspace cache (offline fallback)
  /// 3. SharedPreferences cache for the current session workspace
  /// 4. Auto-select if only one workspace exists
  Future<void> loadWorkspaces({bool forceRefresh = false}) async {
    final requestToken = ++_loadRequestToken;
    final selectionRevisionAtStart = _selectionRevision;
    final cached = forceRefresh
        ? const CacheReadResult<List<Workspace>>(state: CacheEntryState.missing)
        : await _repo.readCachedWorkspaces();
    final hasCachedWorkspaces = cached.hasValue && cached.data != null;

    if (hasCachedWorkspaces) {
      final cachedState = await _buildResolvedState(
        cached.data!,
        status: WorkspaceStatus.loaded,
        includeServerDefault: false,
      );
      if (!_isCurrentLoad(requestToken)) return;
      emit(
        _preserveNewerSelection(
          cachedState,
          selectionRevisionAtStart: selectionRevisionAtStart,
        ),
      );

      if (cached.isFresh) {
        unawaited(_loadLimits());
        return;
      }
    } else {
      emit(state.copyWith(status: WorkspaceStatus.loading, error: null));
    }

    try {
      final workspaces = await _repo.getWorkspaces();
      final resolvedState = await _buildResolvedState(
        workspaces,
        status: WorkspaceStatus.loaded,
        includeServerDefault: true,
      );
      if (!_isCurrentLoad(requestToken)) return;
      emit(
        _preserveNewerSelection(
          resolvedState,
          selectionRevisionAtStart: selectionRevisionAtStart,
        ),
      );

      // Load limits in background (non-blocking)
      unawaited(_loadLimits());
    } on Exception catch (e) {
      if (!_isCurrentLoad(requestToken)) return;
      if (hasCachedWorkspaces) {
        return;
      }
      emit(state.copyWith(status: WorkspaceStatus.error, error: e.toString()));
    }
  }

  /// Selects the active workspace for the current device/session.
  Future<void> selectWorkspace(Workspace workspace) async {
    _selectionRevision += 1;
    emit(
      state.copyWith(currentWorkspace: workspace, hiddenModuleIds: const []),
    );
    await _repo.saveSelectedWorkspace(workspace);
    unawaited(_loadMobileModuleFlags(workspace.id));
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
      final result = await _repo.createWorkspace(name, avatarFile: avatarFile);

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
    _selectionRevision += 1;
    _loadRequestToken += 1;
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
    final hiddenModuleIds = current == null
        ? const <String>[]
        : await _getMobileHiddenModuleIds(current.id);

    return state.copyWith(
      status: status,
      workspaces: workspaces,
      currentWorkspace: current,
      defaultWorkspace: defaultWorkspace,
      hiddenModuleIds: hiddenModuleIds,
      error: null,
    );
  }

  Future<void> _loadMobileModuleFlags(String wsId) async {
    final hiddenModuleIds = await _getMobileHiddenModuleIds(wsId);
    if (isClosed || state.currentWorkspace?.id != wsId) {
      return;
    }
    emit(state.copyWith(hiddenModuleIds: hiddenModuleIds));
  }

  bool _isCurrentLoad(int requestToken) {
    return !isClosed && requestToken == _loadRequestToken;
  }

  WorkspaceState _preserveNewerSelection(
    WorkspaceState resolvedState, {
    required int selectionRevisionAtStart,
  }) {
    if (selectionRevisionAtStart == _selectionRevision) {
      return resolvedState;
    }

    final selectedId = state.currentWorkspace?.id;
    if (selectedId == null) return resolvedState;
    final selectedWorkspace = resolvedState.workspaces
        .where((workspace) => workspace.id == selectedId)
        .firstOrNull;
    if (selectedWorkspace == null) return resolvedState;

    return resolvedState.copyWith(
      currentWorkspace: selectedWorkspace,
      hiddenModuleIds: state.hiddenModuleIds,
    );
  }

  Future<List<String>> _getMobileHiddenModuleIds(String wsId) async {
    try {
      return await _repo.getMobileHiddenModuleIds(wsId);
    } on Object {
      return const [];
    }
  }
}
