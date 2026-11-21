import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_cache.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/projects/cubit/projects_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/fixture_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/http_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_id_store.dart';
import 'package:mobile/features/mastermind/projects/data/projects_memory.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Source extends Mock implements FleetThreadSource {}

/// Holds machine and project reads until released.
class _Gated extends FixtureProjectsRepository {
  _Gated() : super(linkedLatency: Duration.zero);

  final gate = Completer<void>();

  @override
  Future<List<ProjectsMachine>> machines() async {
    await gate.future;
    return await super.machines();
  }

  @override
  Future<ProjectsOverview> projects(ProjectsMachine machine) async {
    await gate.future;
    return await super.projects(machine);
  }
}

void main() {
  var user = 'alice';

  setUp(() {
    user = 'alice';
    resetSharedProjectsRepository();
  });

  test('a page read as Alice is not cached once Bob is signed in', () async {
    final source = _Source();
    final cache = MemoryFleetThreadCache(userId: () => user);
    final gate = Completer<FleetThreadPage>();
    when(
      () => source.threads(
        machineId: any(named: 'machineId'),
        environmentId: any(named: 'environmentId'),
        query: any(named: 'query'),
        projectId: any(named: 'projectId'),
        state: any(named: 'state'),
        cursor: any(named: 'cursor'),
        limit: any(named: 'limit'),
      ),
    ).thenAnswer((_) => gate.future);
    final repository = HttpProjectsRepository(
      source: source,
      cache: cache,
      userId: () => user,
    );
    const machine = ProjectsMachine(
      machineId: 'm4',
      label: 'Build box',
      reachable: true,
      environmentId: 'env_1',
    );
    const query = ProjectThreadQuery();

    final read = repository.threads(machine, query);
    user = 'bob';
    gate.complete(
      FleetThreadPage.parse({
        'machineId': 'm4',
        'threads': [
          {
            'threadId': 't1',
            'title': 'Alice thread',
            'state': 'idle',
            'updatedAt': '2026-11-22T07:00:00.000Z',
            'itemCount': 3,
          },
        ],
        'nextCursor': null,
        'total': 1,
      }),
    );
    await read;
    await Future<void>.delayed(Duration.zero);
    expect(await repository.cachedThreads(machine, query), isNull);
    user = 'alice';
    expect(await repository.cachedThreads(machine, query), isNull);
  });

  test(
    'machines and projects read as Alice are not remembered for Bob',
    () async {
      final repository = _Gated();
      final ids = MemoryProjectsIdStore();
      final cubit = ProjectsCubit(
        repository: repository,
        ids: ids,
        userId: () => user,
      );
      addTearDown(cubit.close);

      final loading = cubit.load();
      user = 'bob';
      repository.gate.complete();
      await loading;
      await Future<void>.delayed(Duration.zero);

      for (final account in ['alice', 'bob']) {
        expect(ProjectsMemory.shared.machinesFor(account), isNull);
        expect(await ids.read(account), isNull);
      }
      expect(cubit.state.machines, isEmpty);
    },
  );

  test('a project read that outlives its account stores nothing', () async {
    final repository = _Gated()..gate.complete();
    final ids = MemoryProjectsIdStore();
    final cubit = ProjectsCubit(
      repository: repository,
      ids: ids,
      userId: () => user,
    );
    addTearDown(cubit.close);
    await cubit.load();
    await Future<void>.delayed(Duration.zero);
    expect((await ids.read('alice'))!.projectIds, ['p_tuturuuu']);

    final gated = _Gated();
    final other = ProjectsCubit(
      repository: gated,
      ids: ids,
      userId: () => user,
    );
    addTearDown(other.close);
    final loading = other.load();
    user = 'bob';
    gated.gate.complete();
    await loading;
    await Future<void>.delayed(Duration.zero);
    expect(await ids.read('bob'), isNull);
    expect(
      ProjectsMemory.shared.overviewOf('bob', cubit.state.machine!),
      isNull,
    );
  });
}
