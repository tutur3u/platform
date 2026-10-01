import 'dart:async';
import 'dart:io';

import 'package:bloc/bloc.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/data/workspace_visibility_repository.dart';

/// Manages workspace selection, listing, and creation.
class WorkspaceCubit extends Cubit<WorkspaceState> {
  WorkspaceCubit({
    required WorkspaceRepository workspaceRepository,
    WorkspaceVisibilityRepository? visibilityRepository,
  }) : _repo = workspaceRepository,
       _visibility = visibilityRepository ?? WorkspaceVisibilityRepository(),
       super(const WorkspaceState());

  final WorkspaceRepository _repo;
  final WorkspaceVisibilityRepository _visibility;
  String? _actor;
  String? _explicitSelectionId;
  bool get hasAuthenticatedActor =>
      _actor != null && _repo.authenticatedUserId == _actor;
  int _visibilityStateRevision = 0;
  int _actorEpoch = 0;
  Future<void> _visibilityPersistence = Future<void>.value();
  int _visibilityRevision = 0;
  int _visibilityRequest = 0;
  int _loadRequestToken = 0;
  int _selectionRevision = 0;

  /// Loads workspaces and resolves the default workspace.
  ///
  /// Resolution order:
  /// 1. Server-side default (`user_private_details.default_workspace_id`)
  /// 2. Local default workspace cache (offline fallback)
  /// 3. Encrypted replica selection (migrated from SharedPreferences)
  /// 4. Auto-select if only one workspace exists
  Future<void> loadWorkspaces({bool forceRefresh = false}) async {
    final actor = _repo.authenticatedUserId;
    if (_actor != actor) {
      _actor = actor;
      _actorEpoch++;
      _explicitSelectionId = null;
      _visibilityRevision++;
      _visibilityRequest++;
      emit(const WorkspaceState());
    }
    if (actor != null) unawaited(refreshHiddenWorkspaces());
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
    _explicitSelectionId = workspace.id;
    emit(
      state.copyWith(currentWorkspace: workspace, hiddenModuleIds: const []),
    );
    await _repo.saveSelectedWorkspace(workspace);
    unawaited(_loadMobileModuleFlags(workspace.id));
  }

  Future<void> setDefaultWorkspace(Workspace workspace) async {
    final actor = _actor;
    await _repo.updateDefaultWorkspace(workspace.id);
    if (isClosed || _actor != actor || _repo.authenticatedUserId != actor) {
      return;
    }
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
      final actor = _actor;
      final limits = await _repo.getWorkspaceLimits();
      if (isClosed || _actor != actor || _repo.authenticatedUserId != actor) {
        return;
      }
      emit(state.copyWith(limits: limits));
    } on Exception catch (_) {
      // Non-critical — UI shows create button without limit info
    }
  }

  /// Clears workspace selection (on logout).
  Future<void> clearWorkspaces() async {
    _selectionRevision += 1;
    _loadRequestToken += 1;
    _visibilityRequest++;
    _visibilityRevision++;
    _actor = null;
    _actorEpoch++;
    _explicitSelectionId = null;
    emit(const WorkspaceState());
    await _repo.clearSelectedWorkspace();
  }

  Future<WorkspaceState> _buildResolvedState(
    List<Workspace> workspaces, {
    required WorkspaceStatus status,
    required bool includeServerDefault,
  }) async {
    final serverDefault = includeServerDefault
        ? await _repo.getDefaultWorkspace()
        : null;
    final localDefaultId = await _repo.loadDefaultWorkspaceId();
    final saved = await _repo.loadSelectedWorkspace();
    final visibilityAtResolution = _visibilityStateRevision;
    final selectionAtResolution = _selectionRevision;
    // Resolve from the latest private list after awaits.
    final visible = workspaces
        .where((workspace) => !state.hiddenWorkspaceIds.contains(workspace.id))
        .toList(growable: false);
    var defaultWorkspace = workspaces
        .where((workspace) => workspace.id == serverDefault?.id)
        .firstOrNull;
    defaultWorkspace ??= workspaces
        .where((workspace) => workspace.id == localDefaultId)
        .firstOrNull;
    defaultWorkspace ??= workspaces
        .where((workspace) => workspace.personal)
        .firstOrNull;
    var current = workspaces
        .where((workspace) => workspace.id == _explicitSelectionId)
        .firstOrNull;
    current ??= visible
        .where((workspace) => workspace.id == saved?.id)
        .firstOrNull;
    current ??= visible
        .where((workspace) => workspace.id == defaultWorkspace?.id)
        .firstOrNull;
    current ??= visible.where((workspace) => workspace.personal).firstOrNull;
    current ??= visible.length == 1 ? visible.first : null;
    defaultWorkspace ??= current;
    if (_actor != null &&
        !state.visibilityResolved &&
        _explicitSelectionId == null) {
      current = null;
    }
    final hiddenModuleIds = current == null
        ? const <String>[]
        : await _getMobileHiddenModuleIds(current.id);

    if (visibilityAtResolution != _visibilityStateRevision ||
        selectionAtResolution != _selectionRevision) {
      return await _buildResolvedState(
        workspaces,
        status: status,
        includeServerDefault: includeServerDefault,
      );
    }
    return state.copyWith(
      status: status,
      workspaces: workspaces,
      emptyMembershipConfirmed: includeServerDefault && workspaces.isEmpty,
      currentWorkspace: current,
      defaultWorkspace: defaultWorkspace,
      hiddenModuleIds: hiddenModuleIds,
      error: null,
    );
  }

  Future<void> _loadMobileModuleFlags(String wsId) async {
    final actor = _actor;
    final hiddenModuleIds = await _getMobileHiddenModuleIds(wsId);
    if (isClosed ||
        _actor != actor ||
        _repo.authenticatedUserId != actor ||
        state.currentWorkspace?.id != wsId) {
      return;
    }
    emit(state.copyWith(hiddenModuleIds: hiddenModuleIds));
  }

  bool _isCurrentLoad(int requestToken) {
    return !isClosed &&
        requestToken == _loadRequestToken &&
        _repo.authenticatedUserId == _actor;
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

  bool _visibilityCurrent(String actor, int revision) =>
      !isClosed &&
      _actor == actor &&
      _repo.authenticatedUserId == actor &&
      _visibilityRevision == revision;

  Future<void> refreshHiddenWorkspaces() async {
    final actor = _actor;
    if (actor == null || state.pendingVisibilityIds.isNotEmpty) return;
    if (state.visibilityStatus == WorkspaceStatus.initial) {
      emit(state.copyWith(visibilityStatus: WorkspaceStatus.loading));
    }
    final request = ++_visibilityRequest;
    final revision = _visibilityRevision;
    bool current() =>
        _visibilityCurrent(actor, revision) && request == _visibilityRequest;
    try {
      final cached = await _visibility.readCached(actor);
      if (!current()) return;
      if (cached.hasValue && cached.data != null) {
        _applyHidden(cached.data!);
      } else {
        emit(state.copyWith(visibilityStatus: WorkspaceStatus.loading));
      }
      final ids = await _visibility.refresh(actor);
      if (!current()) return;
      _applyHidden(ids);
      await _persistVisibility(actor, _actorEpoch);
    } on Object catch (error) {
      if (!current()) return;
      emit(
        state.copyWith(
          visibilityStatus: WorkspaceStatus.error,
          visibilityError: error.toString(),
        ),
      );
    }
  }

  void _applyHidden(List<String> ids) {
    _visibilityStateRevision++;
    final visible = state.workspaces.where((w) => !ids.contains(w.id)).toList();
    var current = state.currentWorkspace;
    if (current == null &&
        state.status == WorkspaceStatus.loaded &&
        !state.visibilityResolved) {
      current =
          visible
              .where((w) => w.id == state.defaultWorkspace?.id)
              .firstOrNull ??
          visible.where((w) => w.personal).firstOrNull ??
          (visible.length == 1 ? visible.first : null);
    }
    if (current != null &&
        ids.contains(current.id) &&
        current.id != _explicitSelectionId) {
      current =
          visible
              .where((w) => w.id == state.defaultWorkspace?.id)
              .firstOrNull ??
          visible.where((w) => w.personal).firstOrNull ??
          (visible..sort((a, b) => a.id.compareTo(b.id))).firstOrNull;
    }

    final scopeChanged = current?.id != state.currentWorkspace?.id;
    emit(
      state.copyWith(
        hiddenWorkspaceIds: ids,
        currentWorkspace: current,
        visibilityStatus: WorkspaceStatus.loaded,
        visibilityResolved: true,
        hiddenModuleIds: current?.id == state.currentWorkspace?.id
            ? state.hiddenModuleIds
            : const [],
        visibilityError: null,
      ),
    );
    if (scopeChanged && current != null) {
      unawaited(_loadMobileModuleFlags(current.id));
    }
  }

  bool _mutationCurrent(String actor, int epoch) =>
      !isClosed &&
      _actor == actor &&
      _actorEpoch == epoch &&
      _repo.authenticatedUserId == actor;

  Future<void> _persistVisibility(String actor, int epoch) {
    // Serialize disk writes and resolve the latest list when the write starts.
    return _visibilityPersistence = _visibilityPersistence.then((_) async {
      if (!_mutationCurrent(actor, epoch)) return;
      try {
        await _visibility.saveCached(actor, state.hiddenWorkspaceIds);
      } on Object {
        // Remote success remains authoritative if local persistence fails.
      }
    });
  }

  Future<void> setWorkspaceHidden(
    String workspaceId, {
    required bool hidden,
  }) async {
    final actor = _actor;
    if (actor == null ||
        _repo.authenticatedUserId != actor ||
        state.pendingVisibilityIds.contains(workspaceId) ||
        !state.workspaces.any((w) => w.id == workspaceId)) {
      return;
    }
    final epoch = _actorEpoch;
    final wasHidden = state.hiddenWorkspaceIds.contains(workspaceId);
    if (hidden && _explicitSelectionId == workspaceId) {
      _explicitSelectionId = null;
    }
    final previousCurrent = state.currentWorkspace;
    final selectionRevision = _selectionRevision;
    _visibilityRevision++;
    _visibilityRequest++;
    final ids = state.hiddenWorkspaceIds.toSet();
    if (hidden) {
      ids.add(workspaceId);
    } else {
      ids.remove(workspaceId);
    }
    emit(
      state.copyWith(
        pendingVisibilityIds: [...state.pendingVisibilityIds, workspaceId],
      ),
    );
    _applyHidden(ids.toList());
    try {
      await _visibility.update(actor, workspaceId, hidden: hidden);
      if (!_mutationCurrent(actor, epoch)) return;
      await _persistVisibility(actor, epoch);
      if (!_mutationCurrent(actor, epoch)) return;
      final selected = state.currentWorkspace;
      if (selectionRevision == _selectionRevision && selected != null) {
        try {
          await _repo.saveSelectedWorkspace(selected);
        } on Object {
          // Selection remains valid if its device cache cannot be persisted.
        }
      }
    } on Object catch (error) {
      if (!_mutationCurrent(actor, epoch)) return;
      final rollback = state.hiddenWorkspaceIds.toSet();
      if (wasHidden) {
        rollback.add(workspaceId);
      } else {
        rollback.remove(workspaceId);
      }
      _applyHidden(rollback.toList());
      emit(
        state.copyWith(
          visibilityError: error.toString(),
          currentWorkspace:
              selectionRevision == _selectionRevision &&
                  previousCurrent != null &&
                  !rollback.contains(previousCurrent.id)
              ? previousCurrent
              : state.currentWorkspace,
        ),
      );
      rethrow;
    } finally {
      if (_mutationCurrent(actor, epoch)) {
        emit(
          state.copyWith(
            pendingVisibilityIds: state.pendingVisibilityIds
                .where((id) => id != workspaceId)
                .toList(),
          ),
        );
      }
    }
  }

  Future<List<String>> _getMobileHiddenModuleIds(String wsId) async {
    try {
      return await _repo.getMobileHiddenModuleIds(wsId);
    } on Object {
      return const [];
    }
  }
}
