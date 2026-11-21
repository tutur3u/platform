import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/projects/data/http_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

const _base = '/api/v1/mastermind/fleet';

void main() {
  late _Api api;
  late HttpProjectsRepository repository;

  setUp(() {
    api = _Api();
    repository = HttpProjectsRepository(api: api);
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

  test(
    'resolves the first connected bridge machine, then its machines',
    () async {
      when(() => api.getJson('$_base/live')).thenAnswer(
        (_) async => {
          'machines': [
            {'machineId': 'old-box', 'connected': false},
            {'machineId': 'm4', 'connected': true},
          ],
        },
      );
      when(
        () => api.getJson('$_base/threads/machines?machineId=m4'),
      ).thenAnswer(
        (_) async => {
          'machineId': 'm4',
          'machines': [
            {'label': 'This machine', 'reachable': true},
            {
              'label': 'Build box',
              'environmentId': 'env_1',
              'reachable': false,
            },
          ],
        },
      );
      final machines = await repository.machines();
      expect(machines.map((m) => m.machineId), ['m4', 'm4']);
      expect(machines.first.linked, isFalse);
      expect(machines.last.linked, isTrue);
      expect(machines.last.reachable, isFalse);
    },
  );

  test('pages threads with an integer cursor and no project query', () async {
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'machineId': 'm4',
        'environmentId': 'env_1',
        'threads': [
          {
            'threadId': 't1',
            'title': 'One',
            'state': 'running',
            'updatedAt': '2026-11-22T07:00:00.000Z',
            'itemCount': 9,
            'seenItemCount': 4,
          },
        ],
        'nextCursor': null,
        'total': 140,
      },
    );
    final page = await repository.threads(
      linked,
      const ProjectThreadQuery(search: 'one', cursor: 50),
    );
    final path = verify(() => api.getJson(captureAny())).captured.single;
    expect(Uri.parse(path as String).queryParameters, {
      'machineId': 'm4',
      'environmentId': 'env_1',
      'q': 'one',
      'cursor': '50',
      'limit': '50',
    });
    expect(page.nextCursor, isNull);
    expect(page.threads.single.unread, 5);
  });

  test('marks a thread read and announces it', () async {
    when(
      () => api.postJson(any(), any()),
    ).thenAnswer((_) async => {'saved': true});
    final mark = repository.seenMarks.first;
    await repository.markRead(bridge, threadId: 't1', itemCount: 9);
    verify(
      () => api.postJson('$_base/threads/read', {
        'machineId': 'm4',
        'threadId': 't1',
        'itemCount': 9,
      }),
    ).called(1);
    expect((await mark).itemCount, 9);
  });

  test('an unsaved read marker announces nothing', () async {
    when(
      () => api.postJson(any(), any()),
    ).thenAnswer((_) async => {'saved': false});
    final marks = <ThreadSeenMark>[];
    final sub = repository.seenMarks.listen(marks.add);
    addTearDown(sub.cancel);
    final saved = await repository.markRead(
      bridge,
      threadId: 't1',
      itemCount: 9,
    );
    await Future<void>.delayed(Duration.zero);
    expect(saved, isFalse);
    expect(marks, isEmpty);
  });

  test('a search over 100 characters is clipped before it is sent', () async {
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'machineId': 'm4',
        'threads': <Object>[],
        'nextCursor': null,
        'total': 0,
      },
    );
    await repository.threads(bridge, ProjectThreadQuery(search: 'b' * 150));
    final path = verify(() => api.getJson(captureAny())).captured.single;
    expect(Uri.parse(path as String).queryParameters['q'], hasLength(100));
  });

  test('maps Web errors to closed categories', () {
    ProjectsFailureKind kind(int status, String error) =>
        HttpProjectsRepository.failureOf(
          ApiException(message: error, statusCode: status),
        );
    expect(kind(503, 'machine_offline'), ProjectsFailureKind.machineOffline);
    expect(kind(503, 'unavailable'), ProjectsFailureKind.unavailable);
    expect(kind(503, 'unconfigured'), ProjectsFailureKind.unavailable);
    expect(kind(504, 'timeout'), ProjectsFailureKind.timeout);
    expect(kind(404, 'unknown_thread'), ProjectsFailureKind.notFound);
    expect(kind(401, 'mfa_required'), ProjectsFailureKind.mfaRequired);
    expect(kind(403, 'forbidden'), ProjectsFailureKind.forbidden);
    expect(kind(429, 'rate_limited'), ProjectsFailureKind.rateLimited);
    expect(
      kind(422, 'unsupported_for_linked_machine'),
      ProjectsFailureKind.unsupportedForLinkedMachine,
    );
    expect(kind(422, 'invalid_query'), ProjectsFailureKind.invalid);
    expect(kind(422, 'invalid_marker'), ProjectsFailureKind.unavailable);
  });

  Map<String, dynamic> row(int i, {String? projectId, String state = 'idle'}) =>
      {
        'threadId': 't$i',
        'title': 'Thread $i',
        'projectId': ?projectId,
        'state': state,
        'updatedAt': '2026-11-22T07:00:00.000Z',
        'itemCount': 3,
      };

  void answerPages(
    List<Map<String, dynamic>> Function(int cursor) rows, {
    required int last,
  }) {
    when(() => api.getJson(any())).thenAnswer((call) async {
      final uri = Uri.parse(call.positionalArguments.single as String);
      final cursor = int.parse(uri.queryParameters['cursor'] ?? '0');
      return {
        'machineId': 'm4',
        'threads': rows(cursor),
        'nextCursor': cursor + 50 >= last ? null : cursor + 50,
        'total': last,
      };
    });
  }

  test('keeps only in-scope rows and reads on to fill a page', () async {
    // One running thread of project p per 50-row page: 4 reads, then stop.
    answerPages(
      (cursor) => [
        for (var i = cursor; i < cursor + 50; i++)
          row(
            i,
            projectId: i % 50 == 0 ? 'p' : 'q',
            state: i % 50 == 0 ? 'running' : 'idle',
          ),
      ],
      last: 1000,
    );
    final page = await repository.threads(
      bridge,
      const ProjectThreadQuery(
        projectId: 'p',
        state: ProjectThreadState.running,
      ),
    );
    expect(page.threads.map((t) => t.threadId), ['t0', 't50', 't100', 't150']);
    expect(page.nextCursor, 200);
    verify(
      () => api.getJson(any()),
    ).called(HttpProjectsRepository.maxScanReads);
  });

  test('none means no project; an empty scan keeps its cursor', () async {
    answerPages(
      (cursor) => [
        for (var i = cursor; i < cursor + 50; i++) row(i, projectId: 'p'),
      ],
      last: 1000,
    );
    final page = await repository.threads(
      bridge,
      const ProjectThreadQuery(projectId: ProjectGroup.unassignedId),
    );
    expect(page.threads, isEmpty);
    expect(page.nextCursor, 200);
  });

  test('never sends projectId=none to a linked machine', () async {
    answerPages(
      (cursor) => [
        for (var i = cursor; i < cursor + 50; i++)
          row(i, projectId: i.isEven ? 'p' : null),
      ],
      last: 50,
    );
    final page = await repository.threads(
      linked,
      const ProjectThreadQuery(projectId: ProjectGroup.unassignedId),
    );
    final path = verify(() => api.getJson(captureAny())).captured.single;
    expect(
      Uri.parse(path as String).queryParameters.containsKey('projectId'),
      isFalse,
    );
    expect(page.threads.every((t) => t.projectId == null), isTrue);
    expect(page.threads, hasLength(25));
  });

  test('stops at the end of the list', () async {
    answerPages(
      (cursor) => [
        for (var i = cursor; i < cursor + 50; i++)
          row(i, projectId: i % 3 == 0 ? null : 'p'),
      ],
      last: 80,
    );
    final page = await repository.threads(
      bridge,
      const ProjectThreadQuery(projectId: ProjectGroup.unassignedId),
    );
    expect(page.threads, hasLength(34));
    expect(page.nextCursor, isNull);
    verify(() => api.getJson(any())).called(2);
  });

  test('reads projects live and surfaces a 404 as notFound', () async {
    when(() => api.getJson('$_base/threads/projects?machineId=m4')).thenAnswer(
      (_) async => {
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
      },
    );
    final overview = await repository.projects(bridge);
    expect(overview.groups.map((g) => g.projectId), ['p', 'none']);

    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException(message: 'not_found', statusCode: 404));
    expect(
      () => repository.projects(bridge),
      throwsA(
        isA<ProjectsException>().having(
          (e) => e.kind,
          'kind',
          ProjectsFailureKind.notFound,
        ),
      ),
    );
  });

  test('a linked machine is never asked for projects', () {
    expect(
      () => repository.projects(linked),
      throwsA(isA<ProjectsException>()),
    );
    verifyNever(() => api.getJson(any()));
  });
}
