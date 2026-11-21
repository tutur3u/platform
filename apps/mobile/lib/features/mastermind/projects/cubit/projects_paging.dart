part of 'projects_cubit.dart';

/// Paging a group or the flat list.
extension _ProjectsPaging on ProjectsCubit {
  Future<void> _loadGroup(
    int generation,
    String projectId, {
    required bool reset,
  }) async {
    final machine = state.machine;
    if (machine == null || machine.linked) return;
    // A reset keeps the rows on screen until the fresh page replaces them.
    final current = state.groups[projectId] ?? const ThreadListSlice();
    _putGroup(projectId, current.copyWith(loading: true, failure: () => null));
    final owner = _userId();
    try {
      final page = await _repository.threads(
        machine,
        ProjectThreadQuery(
          projectId: projectId,
          state: state.filter,
          cursor: reset ? null : current.nextCursor,
        ),
      );
      if (reset && state.filter == null && _signedIn(owner)) {
        _rememberProject(owner, projectId);
      }
      if (_stale(generation)) return _settleStaleGroup(projectId);
      _putGroup(
        projectId,
        (reset ? const ThreadListSlice() : current).append(page),
      );
    } on ProjectsException catch (error) {
      if (_stale(generation)) return _settleStaleGroup(projectId);
      _putGroup(
        projectId,
        current.copyWith(loading: false, failure: () => error.kind),
      );
    }
  }

  Future<void> _loadFlat(int generation, {required bool reset}) async {
    final machine = state.machine;
    if (machine == null) return;
    final current = state.flat;
    _set(
      state.copyWith(
        flat: current.copyWith(loading: true, failure: () => null),
      ),
    );
    try {
      final search = state.search;
      final page = await _repository.threads(
        machine,
        ProjectThreadQuery(
          state: state.filter,
          search: search.isEmpty ? null : search,
          cursor: reset ? null : current.nextCursor,
        ),
      );
      if (_stale(generation)) return _settleStaleFlat();
      _set(
        state.copyWith(
          status: ProjectsStatus.ready,
          failure: () => null,
          fetchedAt: reset ? () => page.cachedAt ?? _clock().toUtc() : null,
          busy: false,
          flat: (reset ? const ThreadListSlice() : current).append(page),
        ),
      );
    } on ProjectsException catch (error) {
      if (_stale(generation)) return _settleStaleFlat();
      _set(state.copyWith(flat: state.flat.copyWith(loading: false)));
      _fail(error.kind);
    }
  }

  /// A page whose read was overtaken: the overtaking read owns the rows, so
  /// this one only takes back the loading row it put up, when still shown.
  void _settleStaleGroup(String projectId) {
    if (isClosed) return;
    final slice = state.groups[projectId];
    if (slice != null && slice.loading) {
      _putGroup(projectId, slice.copyWith(loading: false));
    }
  }

  void _settleStaleFlat() {
    if (isClosed || !state.flat.loading || state.busy) return;
    _set(state.copyWith(flat: state.flat.copyWith(loading: false)));
  }
}
