import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/projects/cubit/projects_state.dart';
import 'package:mobile/features/mastermind/projects/cubit/slice_ops.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';

export 'package:mobile/features/mastermind/projects/cubit/projects_state.dart';

/// The Projects list. Every read is a snapshot taken on entry, resume, pull
/// to refresh or a live `threads` poke; the cubit never polls.
///
/// The bridge machine groups threads by project: headers come from
/// `/threads/projects` and an expanded group pages in 50 at a time. Linked
/// machines refuse project reads, so they and any search list flat.
class ProjectsCubit extends Cubit<ProjectsState> {
  ProjectsCubit({
    required ProjectsRepository repository,
    ProjectThreadState? initialFilter,
    DateTime Function()? clock,
  }) : _repository = repository,
       _clock = clock ?? DateTime.now,
       super(ProjectsState(filter: initialFilter)) {
    _seen = repository.seenMarks.listen(_applySeen);
  }

  static const pageSize = 50;

  /// Groups open on first load, newest activity first.
  static const initiallyExpanded = 1;

  final ProjectsRepository _repository;
  final DateTime Function() _clock;
  late final StreamSubscription<ThreadSeenMark> _seen;
  int _generation = 0;
  bool _seeded = false;

  @override
  Future<void> close() async {
    await _seen.cancel();
    await super.close();
  }

  /// A thread read elsewhere clears its badge here, without a refetch.
  void _applySeen(ThreadSeenMark mark) {
    if (isClosed || mark.machineKey != state.machine?.key) return;
    emit(
      state.copyWith(
        flat: state.flat.withSeen(mark),
        groups: {
          for (final MapEntry(:key, :value) in state.groups.entries)
            key: value.withSeen(mark),
        },
      ),
    );
  }

  Future<void> load() async {
    if (state.machines.isEmpty) {
      try {
        final machines = await _repository.machines();
        if (isClosed) return;
        final machine = state.machine ?? machines.firstOrNull;
        emit(state.copyWith(machines: machines, machine: machine));
      } on ProjectsException catch (error) {
        if (!isClosed) _fail(error.kind);
        return;
      }
    }
    await refresh();
  }

  /// Re-reads what is on screen: the project headers and each open group, or
  /// the first page of the flat list.
  Future<void> refresh() async {
    final machine = state.machine;
    if (machine == null) {
      await load();
      return;
    }
    final generation = ++_generation;
    try {
      await _readView(generation);
    } on ProjectsException catch (error) {
      if (!_stale(generation)) _fail(error.kind);
    }
  }

  /// Reads the first page of what the state shows: the flat list for a
  /// linked machine or a search, else the project headers and open groups.
  /// The rows on screen stay until the answer replaces them; a failure is
  /// thrown to the caller.
  Future<void> _readView(int generation) async {
    final machine = state.machine!;
    // The bridge machine asks for projects on every read, so grouping turns
    // on once the route answers.
    if (machine.linked || state.search.isNotEmpty) {
      await _readFirstFlat(generation);
      return;
    }
    final ProjectsOverview overview;
    try {
      overview = await _repository.projects(machine);
    } on ProjectsException catch (error) {
      if (error.kind != ProjectsFailureKind.notFound &&
          error.kind != ProjectsFailureKind.unsupportedForLinkedMachine) {
        rethrow;
      }
      if (_stale(generation)) return;
      // No project read yet: list this machine flat, filtered locally.
      emit(state.copyWith(groupable: false));
      await _readFirstFlat(generation);
      return;
    }
    if (_stale(generation)) return;
    final expanded = _seeded
        ? state.expanded
        : {
            for (final group in overview.groups.take(initiallyExpanded))
              group.projectId,
          };
    _seeded = true;
    emit(
      state.copyWith(
        status: ProjectsStatus.ready,
        overview: () => overview,
        fetchedAt: () => overview.cachedAt ?? _clock().toUtc(),
        failure: () => null,
        expanded: expanded,
        groupable: true,
        busy: false,
      ),
    );
    await Future.wait([
      for (final id in expanded)
        if (_visible(overview, id)) _loadGroup(generation, id, reset: true),
    ]);
  }

  Future<void> _readFirstFlat(int generation) async {
    emit(state.copyWith(flat: state.flat.copyWith(loading: true)));
    final page = await _readFlat(filter: state.filter, search: state.search);
    if (!_stale(generation)) _settleFlat(page);
  }

  Future<void> selectMachine(ProjectsMachine machine) async {
    if (!machine.reachable || machine == state.machine) return;
    _seeded = false;
    emit(
      ProjectsState(
        machines: state.machines,
        machine: machine,
        filter: state.filter,
        search: state.search,
      ),
    );
    await refresh();
  }

  /// Selects [filter] at once; the list on screen stays until the filtered
  /// read answers. A failed read restores the previous filter and list.
  Future<void> setFilter(ProjectThreadState? filter) async {
    if (filter == state.filter) return;
    final previous = state;
    final generation = ++_generation;
    emit(state.copyWith(filter: () => filter, busy: true));
    try {
      if (state.flatMode) {
        final page = await _readFlat(filter: filter, search: state.search);
        if (_stale(generation)) return;
        _settleFlat(page);
        return;
      }
      final overview = state.overview;
      if (overview == null) {
        emit(state.copyWith(busy: false));
        await refresh();
        return;
      }
      final machine = state.machine!;
      final ids = [
        for (final id in state.expanded)
          if (_visible(overview, id)) id,
      ];
      final pages = await Future.wait([
        for (final id in ids)
          _repository.threads(
            machine,
            ProjectThreadQuery(projectId: id, state: filter),
          ),
      ]);
      if (_stale(generation)) return;
      emit(
        state.copyWith(
          busy: false,
          failure: () => null,
          groups: {
            for (final (index, id) in ids.indexed)
              id: const ThreadListSlice().append(pages[index]),
          },
        ),
      );
    } on ProjectsException catch (error) {
      if (!_stale(generation)) _rollback(previous, error.kind);
    }
  }

  /// Applies [search] (trimmed, at most [maxProjectsSearchLength]
  /// characters), clearing it included. A failed read restores the previous
  /// search and list.
  Future<void> setSearch(String search) async {
    final next = clipProjectsSearch(search) ?? '';
    if (next == state.search || state.machine == null) return;
    final previous = state;
    final generation = ++_generation;
    // The search is in effect at once, so a refresh or poke meanwhile reads
    // it too; the rows on screen stay until its answer replaces them.
    emit(state.copyWith(search: next, busy: true));
    try {
      await _readView(generation);
    } on ProjectsException catch (error) {
      if (!_stale(generation)) _rollback(previous, error.kind);
    }
  }

  Future<ThreadListPage> _readFlat({
    required ProjectThreadState? filter,
    required String search,
  }) => _repository.threads(
    state.machine!,
    ProjectThreadQuery(state: filter, search: search.isEmpty ? null : search),
  );

  void _settleFlat(ThreadListPage page) => emit(
    state.copyWith(
      busy: false,
      status: ProjectsStatus.ready,
      failure: () => null,
      fetchedAt: () => page.cachedAt ?? _clock().toUtc(),
      flat: const ThreadListSlice().append(page),
    ),
  );

  /// Puts back the filter, search and lists from before a change whose read
  /// failed, with the failure shown over them.
  void _rollback(ProjectsState previous, ProjectsFailureKind kind) => emit(
    previous.copyWith(
      failure: () => kind,
      status: previous.hasContent
          ? ProjectsStatus.ready
          : ProjectsStatus.failed,
      busy: false,
      rollbacks: state.rollbacks + 1,
    ),
  );

  Future<void> toggle(String projectId) async {
    final expanded = {...state.expanded};
    if (!expanded.remove(projectId)) expanded.add(projectId);
    emit(state.copyWith(expanded: expanded));
    if (expanded.contains(projectId) && state.groups[projectId] == null) {
      await _loadGroup(_generation, projectId, reset: true);
    }
  }

  Future<void> loadMore(String projectId) {
    final slice = state.groups[projectId];
    if (slice == null || slice.loading || !slice.hasMore) {
      return Future.value();
    }
    return _loadGroup(_generation, projectId, reset: false);
  }

  /// Reads a group again after its last page failed.
  Future<void> retryGroup(String projectId) {
    final slice = state.groups[projectId];
    if (slice?.loading ?? false) return Future.value();
    final reset = slice == null || slice.threads.isEmpty;
    return _loadGroup(_generation, projectId, reset: reset);
  }

  Future<void> loadMoreFlat() {
    if (state.flat.loading || !state.flat.hasMore) return Future.value();
    return _loadFlat(_generation, reset: false);
  }

  /// A header with no thread of the filtered state is hidden, so it is not
  /// read either.
  bool _visible(ProjectsOverview overview, String projectId) {
    final group = overview.groups
        .where((g) => g.projectId == projectId)
        .firstOrNull;
    if (group == null) return false;
    final filter = state.filter;
    return filter == null || group.counts.of(filter) > 0;
  }

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
    try {
      final page = await _repository.threads(
        machine,
        ProjectThreadQuery(
          projectId: projectId,
          state: state.filter,
          cursor: reset ? null : current.nextCursor,
        ),
      );
      if (_stale(generation)) return;
      _putGroup(
        projectId,
        (reset ? const ThreadListSlice() : current).append(page),
      );
    } on ProjectsException catch (error) {
      if (_stale(generation)) return;
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
    emit(
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
      if (_stale(generation)) return;
      emit(
        state.copyWith(
          status: ProjectsStatus.ready,
          failure: () => null,
          fetchedAt: reset ? () => page.cachedAt ?? _clock().toUtc() : null,
          busy: false,
          flat: (reset ? const ThreadListSlice() : current).append(page),
        ),
      );
    } on ProjectsException catch (error) {
      if (_stale(generation)) return;
      emit(state.copyWith(flat: state.flat.copyWith(loading: false)));
      _fail(error.kind);
    }
  }

  void _putGroup(String projectId, ThreadListSlice slice) =>
      emit(state.copyWith(groups: {...state.groups, projectId: slice}));

  /// Keeps whatever list is on screen; only a screen with nothing to show
  /// turns into a failure state.
  void _fail(ProjectsFailureKind kind) => emit(
    state.copyWith(
      failure: () => kind,
      status: state.hasContent ? ProjectsStatus.ready : ProjectsStatus.failed,
      busy: false,
      flat: state.flat.copyWith(loading: false),
    ),
  );

  bool _stale(int generation) => isClosed || generation != _generation;
}
