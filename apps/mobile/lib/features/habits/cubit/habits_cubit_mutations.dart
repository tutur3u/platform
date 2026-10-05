part of 'habits_cubit.dart';

extension _HabitsMutations on HabitsCubit {
  Future<void> _createTracker(HabitTrackerInput input) async {
    _checkScope();
    final epoch = _workspaceEpoch;
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    _publish(state.copyWith(isSubmittingTracker: true, error: null));
    try {
      final tracker = await _repository.createTracker(wsId, input);
      if (!_scopeActive ||
          epoch != _workspaceEpoch ||
          state.activeWorkspaceId != wsId) {
        return;
      }
      await _reloadAfterMutation(selectTrackerId: tracker.id);
    } finally {
      if (_scopeActive &&
          epoch == _workspaceEpoch &&
          state.activeWorkspaceId == wsId) {
        _publish(state.copyWith(isSubmittingTracker: false));
      }
    }
  }

  Future<void> _updateTracker(String trackerId, HabitTrackerInput input) async {
    _checkScope();
    final epoch = _workspaceEpoch;
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    _publish(state.copyWith(isSubmittingTracker: true, error: null));
    try {
      final tracker = await _repository.updateTracker(wsId, trackerId, input);
      if (!_scopeActive ||
          epoch != _workspaceEpoch ||
          state.activeWorkspaceId != wsId) {
        return;
      }
      await _reloadAfterMutation(selectTrackerId: tracker.id);
    } finally {
      if (_scopeActive &&
          epoch == _workspaceEpoch &&
          state.activeWorkspaceId == wsId) {
        _publish(state.copyWith(isSubmittingTracker: false));
      }
    }
  }

  Future<void> _archiveTracker(String trackerId) async {
    _checkScope();
    final epoch = _workspaceEpoch;
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    _publish(state.copyWith(isArchivingTracker: true, error: null));
    try {
      await _repository.archiveTracker(wsId, trackerId);
      if (!_scopeActive ||
          epoch != _workspaceEpoch ||
          state.activeWorkspaceId != wsId) {
        return;
      }
      final nextTrackers = state.trackers
          .where((value) => value.tracker.id != trackerId)
          .toList(growable: false);
      final nextTrackerId = nextTrackers.isEmpty
          ? null
          : nextTrackers.first.tracker.id;
      if (!_scopeActive ||
          epoch != _workspaceEpoch ||
          state.activeWorkspaceId != wsId) {
        return;
      }
      await _reloadAfterMutation(selectTrackerId: nextTrackerId);
    } finally {
      if (_scopeActive &&
          epoch == _workspaceEpoch &&
          state.activeWorkspaceId == wsId) {
        _publish(state.copyWith(isArchivingTracker: false));
      }
    }
  }

  Future<void> _createEntry(
    String trackerId,
    HabitTrackerEntryInput input,
  ) async {
    _checkScope();
    final epoch = _workspaceEpoch;
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    _publish(state.copyWith(isSubmittingEntry: true, error: null));
    try {
      final entry = await _repository.createEntry(wsId, trackerId, input);
      if (!_scopeActive ||
          epoch != _workspaceEpoch ||
          state.activeWorkspaceId != wsId) {
        return;
      }
      final drafts = <String, String>{...state.quickLogDrafts}
        ..remove(trackerId);
      var nextState = state.copyWith(quickLogDrafts: drafts);
      nextState = _applyCreatedEntryLocally(nextState, trackerId, entry);
      final now = DateTime.now();
      nextState = nextState.copyWith(
        lastUpdatedAt: now,
        detailLastUpdatedAt: nextState.detail == null ? null : now,
        activityLastUpdatedAt: nextState.activityEntries.isEmpty ? null : now,
      );
      _publish(nextState);
      _storeCache(nextState);
      if (!_scopeActive ||
          epoch != _workspaceEpoch ||
          state.activeWorkspaceId != wsId) {
        return;
      }
      await _reloadAfterMutation(selectTrackerId: trackerId);
    } finally {
      if (_scopeActive &&
          epoch == _workspaceEpoch &&
          state.activeWorkspaceId == wsId) {
        _publish(state.copyWith(isSubmittingEntry: false));
      }
    }
  }

  Future<void> _deleteEntry(String trackerId, String entryId) async {
    _checkScope();
    final epoch = _workspaceEpoch;
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    _publish(state.copyWith(isSubmittingEntry: true, error: null));
    try {
      await _repository.deleteEntry(wsId, trackerId, entryId);
      if (!_scopeActive ||
          epoch != _workspaceEpoch ||
          state.activeWorkspaceId != wsId) {
        return;
      }
      await _reloadAfterMutation(selectTrackerId: trackerId);
    } finally {
      if (_scopeActive &&
          epoch == _workspaceEpoch &&
          state.activeWorkspaceId == wsId) {
        _publish(state.copyWith(isSubmittingEntry: false));
      }
    }
  }

  Future<void> _createStreakAction(
    String trackerId,
    HabitTrackerStreakActionInput input,
  ) async {
    _checkScope();
    final epoch = _workspaceEpoch;
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    _publish(state.copyWith(isSubmittingStreakAction: true, error: null));
    try {
      await _repository.createStreakAction(wsId, trackerId, input);
      if (!_scopeActive ||
          epoch != _workspaceEpoch ||
          state.activeWorkspaceId != wsId) {
        return;
      }
      await _reloadAfterMutation(selectTrackerId: trackerId);
    } finally {
      if (_scopeActive &&
          epoch == _workspaceEpoch &&
          state.activeWorkspaceId == wsId) {
        _publish(state.copyWith(isSubmittingStreakAction: false));
      }
    }
  }

  Future<void> _reloadAfterMutation({String? selectTrackerId}) async {
    _checkScope();
    final epoch = _workspaceEpoch;
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    final shouldRefreshActivity =
        state.activityStatus != HabitsStatus.initial ||
        state.activityEntries.isNotEmpty;

    final nextState = state.copyWith(selectedTrackerId: selectTrackerId);
    _publish(nextState);
    _storeCache(nextState);
    await loadWorkspace(wsId, refresh: true);
    if (!_scopeActive ||
        epoch != _workspaceEpoch ||
        state.activeWorkspaceId != wsId) {
      return;
    }
    if (selectTrackerId != null) {
      await loadTrackerDetail(selectTrackerId, refresh: true);
    }
    if (!_scopeActive ||
        epoch != _workspaceEpoch ||
        state.activeWorkspaceId != wsId) {
      return;
    }
    if (shouldRefreshActivity) {
      await loadActivity(refresh: true);
    }
  }
}
