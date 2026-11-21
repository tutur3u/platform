import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/projects/cubit/projects_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/fixture_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_id_store.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';

final _now = DateTime.utc(2026, 11, 22, 7);

void main() {
  late FixtureProjectsRepository repository;
  late ProjectsCubit cubit;

  setUp(() {
    resetSharedProjectsRepository();
    repository = FixtureProjectsRepository(
      now: _now,
      linkedLatency: Duration.zero,
    );
    cubit = ProjectsCubit(repository: repository, clock: () => _now);
  });

  tearDown(() => cubit.close());

  test('groups by project with header counts, unassigned last', () async {
    await cubit.load();
    final overview = cubit.state.overview!;
    expect(cubit.state.flatMode, isFalse);
    expect(overview.groups.map((g) => g.projectId), [
      'p_tuturuuu',
      'p_mastermind',
      'p_t3code',
      'p_docs',
      'none',
    ]);
    final big = overview.groups.first.counts;
    expect([big.running, big.waiting, big.failed, big.idle], [2, 1, 1, 4996]);
    final totals = overview.totals;
    expect([totals.running, totals.waiting, totals.failed], [10, 5, 4]);
    // Only the newest group opens, with its first page of 50.
    expect(cubit.state.expanded, {'p_tuturuuu'});
    expect(cubit.state.groups['p_tuturuuu']!.threads, hasLength(50));
    expect(cubit.state.groups.containsKey('p_mastermind'), isFalse);
    await cubit.toggle('p_mastermind');
    expect(cubit.state.groups['p_mastermind']!.threads, hasLength(14));
    expect(cubit.state.groups['p_mastermind']!.hasMore, isFalse);
  });

  test(
    'Load 50 more pages an expanded group with the integer cursor',
    () async {
      await cubit.load();
      await cubit.loadMore('p_tuturuuu');
      final slice = cubit.state.groups['p_tuturuuu']!;
      expect(slice.threads, hasLength(100));
      expect(slice.nextCursor, 100);
      expect(slice.total, 5000);
      expect(repository.calls, contains('threads::p_tuturuuu:50'));
    },
  );

  test('a collapsed group reads nothing until it opens', () async {
    await cubit.load();
    expect(cubit.state.groups.containsKey('p_docs'), isFalse);
    await cubit.toggle('p_docs');
    expect(cubit.state.groups['p_docs']!.threads, hasLength(6));
  });

  test('a linked machine lists flat and never asks for projects', () async {
    await cubit.load();
    repository.calls.clear();
    final linked = cubit.state.machines[1];
    await cubit.selectMachine(linked);
    expect(cubit.state.flatMode, isTrue);
    expect(cubit.state.flat.threads, hasLength(50));
    expect(cubit.state.failure, isNull);
    expect(repository.calls.where((c) => c.startsWith('projects')), isEmpty);
    expect(repository.calls, ['threads:env_m4:-:0']);

    await cubit.setFilter(ProjectThreadState.running);
    expect(
      cubit.state.flat.threads.every(
        (t) => t.state == ProjectThreadState.running,
      ),
      isTrue,
    );
  });

  test('an unreachable machine cannot be selected', () async {
    await cubit.load();
    final unreachable = cubit.state.machines[2];
    expect(unreachable.reachable, isFalse);
    await cubit.selectMachine(unreachable);
    expect(cubit.state.machine, cubit.state.machines.first);
  });

  test('machine_offline keeps the last list and marks it stale', () async {
    await cubit.load();
    final shown = cubit.state.overview;
    repository.failNext = ProjectsFailureKind.machineOffline;
    await cubit.refresh();
    expect(cubit.state.overview, same(shown));
    expect(cubit.state.failure, ProjectsFailureKind.machineOffline);
    expect(cubit.state.stale, isTrue);
    expect(cubit.state.fetchedAt, _now);
    expect(cubit.state.status, ProjectsStatus.ready);
  });

  test('a cold machine_offline is a failure state', () async {
    repository.failNext = ProjectsFailureKind.machineOffline;
    await cubit.load();
    expect(cubit.state.status, ProjectsStatus.failed);
  });

  test('search lists flat across projects', () async {
    await cubit.load();
    await cubit.setSearch('calendar');
    expect(cubit.state.flatMode, isTrue);
    expect(
      cubit.state.flat.threads.every((t) => t.title.contains('calendar')),
      isTrue,
    );
    await cubit.setSearch('');
    expect(cubit.state.flatMode, isFalse);
  });

  test('a read marker clears the unread badge without a refetch', () async {
    await cubit.load();
    final row = cubit.state.groups['p_tuturuuu']!.threads.firstWhere(
      (t) => t.unread == null || t.unread! > 0,
    );
    final calls = repository.calls.length;
    await repository.markRead(
      cubit.state.machine!,
      threadId: row.threadId,
      itemCount: row.itemCount,
    );
    await Future<void>.delayed(Duration.zero);
    final updated = cubit.state.groups['p_tuturuuu']!.threads.firstWhere(
      (t) => t.threadId == row.threadId,
    );
    expect(updated.unread, 0);
    expect(repository.calls.length, calls);
  });

  test('a 404 project read lists flat; a later refresh groups again', () async {
    final noProjects = _NoProjects(repository);
    final flat = ProjectsCubit(repository: noProjects);
    addTearDown(flat.close);
    await flat.load();
    expect(flat.state.groupable, isFalse);
    expect(flat.state.flatMode, isTrue);
    expect(flat.state.failure, isNull);
    expect(flat.state.flat.threads, hasLength(50));
    await flat.setFilter(ProjectThreadState.failed);
    expect(flat.state.flat.threads, isNotEmpty);
    expect(
      flat.state.flat.threads.every(
        (t) => t.state == ProjectThreadState.failed,
      ),
      isTrue,
    );
    noProjects.deployed = true;
    await flat.refresh();
    expect(flat.state.groupable, isTrue);
    expect(flat.state.flatMode, isFalse);
    expect(flat.state.overview, isNotNull);
  });

  test('a failed filter read on a linked machine keeps the list', () async {
    await cubit.load();
    await cubit.selectMachine(cubit.state.machines[1]);
    final shown = cubit.state.flat;
    repository.failNext = ProjectsFailureKind.machineOffline;
    final change = cubit.setFilter(ProjectThreadState.running);
    expect(cubit.state.filter, ProjectThreadState.running);
    expect(cubit.state.busy, isTrue);
    expect(cubit.state.flat.threads, shown.threads);
    await change;
    expect(cubit.state.filter, isNull);
    expect(cubit.state.flat.threads, shown.threads);
    expect(cubit.state.busy, isFalse);
    expect(cubit.state.stale, isTrue);
    expect(cubit.state.rollbacks, 1);
  });

  test('a failed grouped filter read restores filter and groups', () async {
    await cubit.load();
    final groups = cubit.state.groups;
    repository.failNext = ProjectsFailureKind.timeout;
    await cubit.setFilter(ProjectThreadState.waiting);
    expect(cubit.state.filter, isNull);
    expect(
      cubit.state.groups['p_tuturuuu']!.threads,
      groups['p_tuturuuu']!.threads,
    );
    expect(cubit.state.failure, ProjectsFailureKind.timeout);
  });

  test('a failed search keeps the previous search and list', () async {
    await cubit.load();
    await cubit.setSearch('calendar');
    final shown = cubit.state.flat;
    repository.failNext = ProjectsFailureKind.machineOffline;
    await cubit.setSearch('bridge');
    expect(cubit.state.search, 'calendar');
    expect(cubit.state.flat.threads, shown.threads);
    expect(cubit.state.stale, isTrue);
  });

  test('a search is trimmed to 100 characters before it is read', () async {
    await cubit.load();
    await cubit.setSearch('  ${'a' * 150}  ');
    expect(cubit.state.search, hasLength(maxProjectsSearchLength));
  });

  test('a seen mark never lowers a seen count', () async {
    await cubit.load();
    final row = cubit.state.groups['p_tuturuuu']!.threads.firstWhere(
      (t) => (t.seenItemCount ?? 0) > 10,
    );
    await repository.markRead(
      cubit.state.machine!,
      threadId: row.threadId,
      itemCount: 3,
    );
    await Future<void>.delayed(Duration.zero);
    final updated = cubit.state.groups['p_tuturuuu']!.threads.firstWhere(
      (t) => t.threadId == row.threadId,
    );
    expect(updated.seenItemCount, row.seenItemCount);
  });

  test(
    'clearing a search on an offline machine restores search and rows',
    () async {
      final flat = ProjectsCubit(repository: _NoProjects(repository));
      addTearDown(flat.close);
      await flat.load();
      await flat.setSearch('calendar');
      final shown = flat.state.flat.threads;
      expect(shown, isNotEmpty);
      repository.failNext = ProjectsFailureKind.machineOffline;
      final clearing = flat.setSearch('');
      // The search is in effect at once; the rows stay while it is read.
      expect(flat.state.search, '');
      expect(flat.state.flat.threads, shown);
      await clearing;
      expect(flat.state.search, 'calendar');
      expect(flat.state.flat.threads, shown);
      expect(flat.state.stale, isTrue);
      expect(flat.state.rollbacks, 1);
    },
  );

  test('a refresh during an in-flight search reads the new query', () async {
    final recording = _Recording(now: _now);
    final searching = ProjectsCubit(repository: recording);
    addTearDown(searching.close);
    await searching.load();
    recording.searches.clear();
    final search = searching.setSearch('calendar');
    final refresh = searching.refresh();
    await Future.wait([search, refresh]);
    expect(recording.searches, ['calendar', 'calendar']);
    expect(searching.state.search, 'calendar');
    expect(searching.state.busy, isFalse);
    expect(
      searching.state.flat.threads.every((t) => t.title.contains('calendar')),
      isTrue,
    );
  });

  test(
    'offline with nothing in memory shows the cached list and its time',
    () async {
      await cubit.load();
      await cubit.selectMachine(cubit.state.machines[1]);
      expect(cubit.state.flat.threads, isNotEmpty);

      final cold = ProjectsCubit(repository: repository, clock: () => _now);
      addTearDown(cold.close);
      await cold.load();
      repository.failNext = ProjectsFailureKind.machineOffline;
      await cold.selectMachine(cold.state.machines[1]);
      expect(cold.state.status, ProjectsStatus.ready);
      expect(cold.state.flat.threads, cubit.state.flat.threads);
      expect(cold.state.failure, ProjectsFailureKind.machineOffline);
      expect(cold.state.stale, isTrue);
      expect(cold.state.fetchedAt, _now);
    },
  );

  test('a rollback never leaves a restored slice loading', () async {
    final refusing = _RefusesFilters(now: _now);
    final c = ProjectsCubit(repository: refusing);
    addTearDown(c.close);
    await c.load();
    await c.selectMachine(c.state.machines[1]);
    final more = c.loadMoreFlat();
    expect(c.state.flat.loading, isTrue);
    await c.setFilter(ProjectThreadState.running);
    expect(c.state.filter, isNull);
    expect(c.state.flat.loading, isFalse);
    await more;
    expect(c.state.flat.loading, isFalse);
  });

  test(
    'a cold open offline uses the remembered machines and cached groups',
    () async {
      await cubit.load();
      expect(cubit.state.groups['p_tuturuuu']!.threads, isNotEmpty);

      repository.offline = true;
      final cold = ProjectsCubit(repository: repository, clock: () => _now);
      addTearDown(cold.close);
      await cold.load();
      expect(cold.state.machines, cubit.state.machines);
      expect(cold.state.status, ProjectsStatus.ready);
      expect(cold.state.flatMode, isFalse);
      expect(
        cold.state.groups['p_tuturuuu']!.threads,
        cubit.state.groups['p_tuturuuu']!.threads,
      );
      expect(cold.state.stale, isTrue);
    },
  );

  test('offline with nothing remembered is a failure state', () async {
    repository.offline = true;
    await cubit.load();
    expect(cubit.state.status, ProjectsStatus.failed);
    expect(cubit.state.failure, ProjectsFailureKind.machineOffline);
  });

  test('after a restart, stored ids find the cached groups offline', () async {
    final ids = MemoryProjectsIdStore();
    final warm = ProjectsCubit(repository: repository, ids: ids);
    addTearDown(warm.close);
    await warm.load();
    await Future<void>.delayed(Duration.zero);
    final stored = await ids.read('');
    expect(stored!.machineId, FixtureProjectsRepository.bridgeId);
    expect(stored.environmentIds, ['env_m4', 'env_build']);
    expect(stored.projectIds, ['p_tuturuuu']);

    // A restart forgets the session; only the ids and the cache remain.
    resetSharedProjectsRepository();
    repository.offline = true;
    final cold = ProjectsCubit(
      repository: repository,
      ids: ids,
      clock: () => _now,
    );
    addTearDown(cold.close);
    await cold.load();
    expect(cold.state.machines.map((m) => m.environmentId), [
      null,
      'env_m4',
      'env_build',
    ]);
    expect(cold.state.status, ProjectsStatus.ready);
    expect(cold.state.stale, isTrue);
    final group = cold.state.overview!.groups.single;
    // The header's name comes from the cached rows.
    expect(group.project, 'tuturuuu');
    expect(
      cold.state.groups['p_tuturuuu']!.threads,
      warm.state.groups['p_tuturuuu']!.threads,
    );
  });
}

/// Refuses every state-filtered read as offline.
class _RefusesFilters extends FixtureProjectsRepository {
  _RefusesFilters({super.now}) : super(linkedLatency: Duration.zero);

  @override
  Future<ThreadListPage> threads(
    ProjectsMachine machine,
    ProjectThreadQuery query,
  ) {
    if (query.state != null) {
      throw const ProjectsException(ProjectsFailureKind.machineOffline);
    }
    return super.threads(machine, query);
  }
}

/// Records the search of every flat read.
class _Recording extends FixtureProjectsRepository {
  _Recording({super.now});

  final searches = <String?>[];

  @override
  Future<ThreadListPage> threads(
    ProjectsMachine machine,
    ProjectThreadQuery query,
  ) {
    if (query.projectId == null) searches.add(query.search);
    return super.threads(machine, query);
  }
}

/// A bridge whose `/threads/projects` route answers 404 until [deployed].
class _NoProjects implements ProjectsRepository {
  _NoProjects(this._inner);

  final FixtureProjectsRepository _inner;
  bool deployed = false;

  @override
  Future<ProjectsOverview> projects(ProjectsMachine machine) => deployed
      ? _inner.projects(machine)
      : throw const ProjectsException(ProjectsFailureKind.notFound);

  @override
  dynamic noSuchMethod(Invocation invocation) => Function.apply(
    switch (invocation.memberName) {
      #machines => _inner.machines,
      #threads => _inner.threads,
      #cachedThreads => _inner.cachedThreads,
      #markRead => _inner.markRead,
      #seenMarks => () => _inner.seenMarks,
      _ => throw UnimplementedError('${invocation.memberName}'),
    },
    invocation.positionalArguments,
    invocation.namedArguments,
  );
}
