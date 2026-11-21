import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_cache.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/projects/data/http_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Source extends Mock implements FleetThreadSource {}

final _now = DateTime.utc(2026, 11, 22, 7);

FleetThread _thread(int i, {String? projectId, String state = 'idle'}) =>
    FleetThread.parse({
      'threadId': 't$i',
      'title': 'Thread $i',
      'projectId': ?projectId,
      'state': state,
      'updatedAt': '2026-11-22T07:00:00.000Z',
      'itemCount': 9,
      'seenItemCount': 4,
    });

FleetThreadPage _page(List<FleetThread> threads, {int? next, int total = 0}) =>
    FleetThreadPage(
      machineId: 'm4',
      threads: threads,
      nextCursor: next,
      total: total,
    );

void main() {
  late _Api api;
  late _Source source;
  late MemoryFleetThreadCache cache;
  late HttpProjectsRepository repository;

  setUpAll(() => registerFallbackValue(FleetThreadState.idle));

  setUp(() {
    api = _Api();
    source = _Source();
    cache = MemoryFleetThreadCache(userId: () => 'u1', now: () => _now);
    repository = HttpProjectsRepository(api: api, source: source, cache: cache);
  });

  const bridge = ProjectsMachine(
    machineId: 'm4',
    label: 'This machine',
    reachable: true,
  );
  const linked = ProjectsMachine(
    machineId: 'm4',
    label: 'Build box',
    reachable: true,
    environmentId: 'env_1',
  );

  void answerThreads(FleetThreadPage page) => when(
    () => source.threads(
      machineId: any(named: 'machineId'),
      environmentId: any(named: 'environmentId'),
      query: any(named: 'query'),
      projectId: any(named: 'projectId'),
      state: any(named: 'state'),
      cursor: any(named: 'cursor'),
      limit: any(named: 'limit'),
    ),
  ).thenAnswer((_) async => page);

  test('resolves the first connected bridge machine for the list', () async {
    when(() => api.getJson('/api/v1/mastermind/fleet/live')).thenAnswer(
      (_) async => {
        'machines': [
          {'machineId': 'old-box', 'connected': false},
          {'machineId': 'm4', 'connected': true},
        ],
      },
    );
    when(() => source.machines('m4')).thenAnswer(
      (_) async => FleetThreadMachines.parse({
        'machineId': 'm4',
        'machines': [
          {'label': 'This machine', 'reachable': true},
          {'label': 'Build box', 'environmentId': 'env_1', 'reachable': false},
        ],
      }),
    );
    final machines = await repository.machines();
    expect(machines.map((m) => m.machineId), ['m4', 'm4']);
    expect(machines.last.linked, isTrue);
    expect(machines.last.reachable, isFalse);
  });

  test('one read per page, filtered by Web; none never reaches a linked '
      'machine', () async {
    answerThreads(_page([_thread(1), _thread(2, projectId: 'p')], total: 80));
    final page = await repository.threads(
      linked,
      const ProjectThreadQuery(
        projectId: ProjectGroup.unassignedId,
        state: ProjectThreadState.idle,
        cursor: 50,
      ),
    );
    final call = verify(
      () => source.threads(
        machineId: 'm4',
        environmentId: 'env_1',
        query: captureAny(named: 'query'),
        projectId: captureAny(named: 'projectId'),
        state: FleetThreadState.idle,
        cursor: 50,
        limit: 50,
      ),
    )..called(1);
    expect(call.captured, [null, null]);
    // The scope guard keeps only the unassigned row.
    expect(page.threads.map((t) => t.threadId), ['t1']);
    expect(page.total, 80);

    answerThreads(_page(const []));
    await repository.threads(
      bridge,
      const ProjectThreadQuery(projectId: ProjectGroup.unassignedId),
    );
    verify(
      () => source.threads(
        machineId: 'm4',
        environmentId: any(named: 'environmentId'),
        query: any(named: 'query'),
        projectId: fleetNoProject,
        state: any(named: 'state'),
        cursor: any(named: 'cursor'),
        limit: any(named: 'limit'),
      ),
    ).called(1);
  });

  test('a first page is cached; a search or later page is not', () async {
    answerThreads(_page([_thread(1)], next: 50, total: 120));
    const query = ProjectThreadQuery(state: ProjectThreadState.idle);
    await repository.threads(linked, query);
    await repository.threads(
      linked,
      const ProjectThreadQuery(state: ProjectThreadState.idle, cursor: 50),
    );
    await repository.threads(linked, const ProjectThreadQuery(search: 'x'));
    await Future<void>.delayed(Duration.zero);
    final cached = await repository.cachedThreads(linked, query);
    expect(cached!.threads.single.threadId, 't1');
    expect(cached.cachedAt, _now);
    expect(cached.nextCursor, 50);
    expect(
      await repository.cachedThreads(
        linked,
        const ProjectThreadQuery(search: 'x'),
      ),
      isNull,
    );
    expect(
      await repository.cachedThreads(bridge, const ProjectThreadQuery()),
      isNull,
    );
  });

  test('maps projects, and a 404 to notFound', () async {
    when(() => source.projects('m4')).thenAnswer(
      (_) async => FleetThreadProjects.parse({
        'machineId': 'm4',
        'projects': [
          {
            'projectId': 'p',
            'project': 'platform',
            'threadCount': 3,
            'counts': {'running': 1, 'waiting': 0, 'failed': 0, 'idle': 2},
            'latestUpdatedAt': '2026-11-22T07:00:00.000Z',
          },
        ],
        'unassigned': {
          'threadCount': 1,
          'counts': {'running': 0, 'waiting': 0, 'failed': 0, 'idle': 1},
        },
        'total': 4,
      }),
    );
    final overview = await repository.projects(bridge);
    expect(overview.groups.map((g) => g.projectId), ['p', 'none']);
    expect(overview.groups.first.counts.running, 1);

    when(() => source.projects('m4')).thenThrow(
      FleetThreadException.from(
        const ApiException(message: 'not_found', statusCode: 404),
      ),
    );
    await expectLater(
      repository.projects(bridge),
      throwsA(
        isA<ProjectsException>().having(
          (e) => e.kind,
          'kind',
          ProjectsFailureKind.notFound,
        ),
      ),
    );
    expect(
      () => repository.projects(linked),
      throwsA(isA<ProjectsException>()),
    );
  });

  test('marks a thread read and announces it', () async {
    when(
      () => source.markRead(
        machineId: 'm4',
        threadId: 't1',
        itemCount: 9,
        environmentId: any(named: 'environmentId'),
      ),
    ).thenAnswer((_) async => true);
    final mark = repository.seenMarks.first;
    expect(
      await repository.markRead(bridge, threadId: 't1', itemCount: 9),
      isTrue,
    );
    expect((await mark).itemCount, 9);
  });

  test('keeps the badge when Web did not save the mark', () async {
    when(
      () => source.markRead(
        machineId: 'm4',
        threadId: 't1',
        itemCount: 9,
        environmentId: any(named: 'environmentId'),
      ),
    ).thenAnswer((_) async => false);
    var announced = false;
    final sub = repository.seenMarks.listen((_) => announced = true);
    expect(
      await repository.markRead(bridge, threadId: 't1', itemCount: 9),
      isFalse,
    );
    await Future<void>.delayed(Duration.zero);
    expect(announced, isFalse);
    await sub.cancel();
  });

  test('maps fleet failures to the screen categories', () {
    ProjectsFailureKind kind(int status, String error) => projectsFailureOf(
      FleetThreadException.from(
        ApiException(message: error, statusCode: status),
      ),
    );
    expect(kind(503, 'machine_offline'), ProjectsFailureKind.machineOffline);
    expect(kind(503, 'unavailable'), ProjectsFailureKind.unavailable);
    expect(kind(503, 'unconfigured'), ProjectsFailureKind.unavailable);
    expect(kind(504, 'timeout'), ProjectsFailureKind.timeout);
    expect(kind(404, 'unknown_thread'), ProjectsFailureKind.notFound);
    expect(kind(401, 'mfa_required'), ProjectsFailureKind.mfaRequired);
    expect(kind(403, 'forbidden'), ProjectsFailureKind.forbidden);
    expect(kind(429, 'rate_limited'), ProjectsFailureKind.rateLimited);
    expect(kind(422, 'invalid_query'), ProjectsFailureKind.invalid);
    expect(
      kind(422, 'unsupported_for_linked_machine'),
      ProjectsFailureKind.unsupportedForLinkedMachine,
    );
  });
}
