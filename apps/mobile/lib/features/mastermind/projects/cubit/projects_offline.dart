part of 'projects_cubit.dart';

/// The offline view: the device's cached lists, found through what this
/// session remembers or, after a restart, through the stored ids.
extension _ProjectsOffline on ProjectsCubit {
  /// The bridge machine, its environments, and the groups read so far.
  void _rememberMachines(String? owner, List<ProjectsMachine> machines) {
    final bridge = machines.firstOrNull;
    if (bridge == null) return;
    _writeIds(
      owner,
      (known) => ProjectsIds(
        machineId: bridge.machineId,
        environmentIds: [
          for (final m in machines)
            if (m.environmentId case final id?) id,
        ],
        projectIds: known?.machineId == bridge.machineId
            ? known!.projectIds
            : const [],
      ),
    );
  }

  /// A group whose first page the device now caches.
  void _rememberProject(String? owner, String projectId) {
    final machine = state.machine;
    if (machine == null || machine.linked) return;
    _writeIds(
      owner,
      (known) =>
          (known?.machineId == machine.machineId
                  ? known!
                  : ProjectsIds(machineId: machine.machineId))
              .withProject(projectId),
    );
  }

  /// The machines the stored ids name; labels come from the app, since
  /// none are stored.
  Future<List<ProjectsMachine>?> _machinesFromIds(String? owner) async {
    if (owner == null) return null;
    final ids = await _ids?.read(owner);
    if (ids == null) return null;
    return [
      ProjectsMachine(machineId: ids.machineId, label: '', reachable: true),
      for (final env in ids.environmentIds)
        ProjectsMachine(
          machineId: ids.machineId,
          label: env,
          reachable: true,
          environmentId: env,
        ),
    ];
  }

  /// With the machine offline and no list in memory, the lists as this
  /// device last read them, under "Showing the list from" with the oldest
  /// one's time: the flat list first, else, on the bridge machine, each
  /// cached group page. False when nothing is cached.
  Future<bool> _showCached(int generation) async {
    final machine = state.machine;
    final inMemory = state.flatMode
        ? state.flat.threads.isNotEmpty
        : state.overview != null;
    if (machine == null || inMemory) return false;
    final page = await _repository.cachedThreads(
      machine,
      ProjectThreadQuery(
        state: state.filter,
        search: state.search.isEmpty ? null : state.search,
      ),
    );
    if (_stale(generation)) return true;
    if (page != null) {
      _set(
        state.copyWith(
          groupable: state.flatMode ? null : false,
          status: ProjectsStatus.ready,
          failure: () => ProjectsFailureKind.machineOffline,
          fetchedAt: () => page.cachedAt ?? _clock().toUtc(),
          busy: false,
          flat: const ThreadListSlice().append(page),
        ),
      );
      return true;
    }
    if (state.flatMode) return false;
    final owner = _userId();
    final overview = ProjectsMemory.shared.overviewOf(owner, machine);
    if (overview != null) {
      final expanded = state.expanded.isNotEmpty
          ? state.expanded
          : {
              for (final g in overview.groups.take(
                ProjectsCubit.initiallyExpanded,
              ))
                g.projectId,
            };
      return await _showCachedGroups(generation, machine, expanded, overview);
    }
    final ids = owner == null ? null : await _ids?.read(owner);
    if (ids == null || ids.machineId != machine.machineId) return false;
    return await _showCachedGroups(generation, machine, ids.projectIds, null);
  }

  /// Each of [projectIds] with a cached page, under [overview] when this
  /// session read one, else under headers named from the cached rows.
  Future<bool> _showCachedGroups(
    int generation,
    ProjectsMachine machine,
    Iterable<String> projectIds,
    ProjectsOverview? overview,
  ) async {
    final pages = <String, ThreadListPage>{};
    for (final id in projectIds) {
      final page = await _repository.cachedThreads(
        machine,
        ProjectThreadQuery(projectId: id, state: state.filter),
      );
      if (page != null) pages[id] = page;
    }
    if (_stale(generation)) return true;
    if (pages.isEmpty) return false;
    DateTime? oldest;
    for (final page in pages.values) {
      final at = page.cachedAt;
      if (at != null && (oldest == null || at.isBefore(oldest))) oldest = at;
    }
    ProjectGroup header(String id, ThreadListPage page) => ProjectGroup(
      projectId: id,
      project: page.threads.map((t) => t.project).nonNulls.firstOrNull ?? '',
      threadCount: page.total,
      counts: const ProjectStateCounts(),
    );
    final shown =
        overview ??
        ProjectsOverview(
          projects: [
            for (final MapEntry(:key, :value) in pages.entries)
              if (key != ProjectGroup.unassignedId) header(key, value),
          ],
          unassigned: switch (pages[ProjectGroup.unassignedId]) {
            final page? => header(ProjectGroup.unassignedId, page),
            null => const ProjectGroup(
              projectId: ProjectGroup.unassignedId,
              project: '',
              threadCount: 0,
              counts: ProjectStateCounts(),
            ),
          },
        );
    _seeded = true;
    _set(
      state.copyWith(
        status: ProjectsStatus.ready,
        overview: () => shown,
        failure: () => ProjectsFailureKind.machineOffline,
        fetchedAt: () => oldest ?? _clock().toUtc(),
        expanded: pages.keys.toSet(),
        groups: {
          for (final MapEntry(:key, :value) in pages.entries)
            key: const ThreadListSlice().append(value),
        },
        busy: false,
      ),
    );
    return true;
  }
}
