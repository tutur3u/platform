import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

const _thread = 'thread:project:mcp%3Aabc:1234';
const _reply = '7d3c2f1e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

Map<String, dynamic> _threadJson([Map<String, dynamic> over = const {}]) => {
  'threadId': _thread,
  'title': 'Fix the build',
  'projectId': 'p1',
  'project': 'Platform',
  'state': 'running',
  'updatedAt': '2026-11-21T05:00:00.000Z',
  'itemCount': 12,
  ...over,
};

Map<String, dynamic> _counts(int idle) => {
  'threadCount': idle + 3,
  'counts': {'running': 1, 'waiting': 0, 'failed': 2, 'idle': idle},
};

// Product rule: apps/docs/platform/features/mastermind-thread-replies.mdx
void main() {
  late _Api api;
  late FleetThreadRepository repository;

  setUp(() {
    api = _Api();
    repository = FleetThreadRepository(api: api);
  });

  String captured() =>
      verify(() => api.getJson(captureAny())).captured.single as String;

  test('lists threads with every filter in the query, encoded', () async {
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'machineId': 'skr-m4',
        'environmentId': 'env-2',
        'threads': [
          _threadJson({
            'seenItemCount': 10,
            'lastOwnerReplyAt': '2026-11-21T04:30:00.000Z',
          }),
          _threadJson({'threadId': 'thread:b', 'updatedAt': 'not a time'}),
        ],
        'nextCursor': 50,
        'total': 76,
      },
    );
    final page = await repository.threads(
      machineId: 'skr-m4',
      environmentId: 'env-2',
      query: '  build & ship ',
      projectId: fleetNoProject,
      state: FleetThreadState.failed,
      ownerReply: true,
      cursor: 50,
      limit: 20,
    );
    final uri = Uri.parse(captured());
    expect(uri.path, '/api/v1/mastermind/fleet/threads');
    expect(uri.queryParameters, {
      'machineId': 'skr-m4',
      'environmentId': 'env-2',
      'q': 'build & ship',
      'projectId': 'none',
      'state': 'failed',
      'include': 'ownerReply',
      'cursor': '50',
      'limit': '20',
    });
    expect(page.nextCursor, 50);
    expect(page.total, 76);
    final first = page.threads.first;
    expect(first.state, FleetThreadState.running);
    expect(first.unreadCount, 2);
    expect(first.lastOwnerReplyAt, DateTime.utc(2026, 11, 21, 4, 30));
    // A thread never opened counts in full; a bad timestamp is only absent.
    expect(page.threads.last.unreadCount, 12);
    expect(page.threads.last.updatedAt, isNull);
  });

  test('leaves absent filters out of the query', () async {
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'machineId': 'skr-m4',
        'threads': <Object>[],
        'nextCursor': null,
        'total': 0,
      },
    );
    await repository.threads(machineId: 'skr-m4', query: '   ');
    expect(captured(), '/api/v1/mastermind/fleet/threads?machineId=skr-m4');
  });

  test('reads projects, machines and history', () async {
    when(() => api.getJson(any())).thenAnswer((invocation) async {
      final path = Uri.parse(
        invocation.positionalArguments.first as String,
      ).path.split('/').last;
      return switch (path) {
        'projects' => {
          'machineId': 'skr-m4',
          'projects': [
            {
              'projectId': 'p1',
              'project': 'Platform',
              ..._counts(40),
              'latestUpdatedAt': '2026-11-21T05:00:00.000Z',
            },
          ],
          'unassigned': _counts(0),
          'total': 1,
        },
        'machines' => {
          'machineId': 'skr-m4',
          'machines': [
            {'label': 'This machine', 'reachable': true},
            {'environmentId': 'env-2', 'label': 'Studio', 'reachable': false},
          ],
        },
        _ => {
          'machineId': 'skr-m4',
          'thread': _threadJson(),
          'messages': [
            {
              'position': 7,
              'role': 'user',
              'text': 'go on',
              'truncated': false,
              'at': '2026-11-21T05:00:00.000Z',
            },
            {
              'position': 8,
              'role': 'assistant',
              'text': 'Done. [redacted]',
              'truncated': true,
              'at': '2026-11-21T05:00:05.000Z',
            },
          ],
          'earlierPosition': 6,
        },
      };
    });
    final projects = await repository.projects('skr-m4');
    expect(projects.total, 1);
    expect(projects.projects.single.name, 'Platform');
    expect(projects.projects.single.counts.failed, 2);
    expect(projects.projects.single.counts.threadCount, 43);
    expect(projects.unassigned.idle, 0);

    final machines = await repository.machines('skr-m4');
    expect(machines.machines.first.environmentId, isNull);
    expect(machines.machines.last.reachable, isFalse);

    final history = await repository.messages(
      machineId: 'skr-m4',
      threadId: _thread,
      before: 120,
      limit: 30,
    );
    expect(history.earlierPosition, 6);
    expect(history.messages.map((m) => m.role), [
      FleetMessageRole.user,
      FleetMessageRole.assistant,
    ]);
    expect(history.messages.last.truncated, isTrue);
    final paths = verify(() => api.getJson(captureAny())).captured;
    // The thread id travels percent-encoded, so its own `%3A` survives.
    expect(Uri.parse(paths.last as String).queryParameters, {
      'machineId': 'skr-m4',
      'threadId': _thread,
      'before': '120',
      'limit': '30',
    });
  });

  test(
    'sends a reply with its key in the body and reads the receipt',
    () async {
      when(() => api.postJson(any(), any())).thenAnswer(
        (_) async => {
          'id': _reply,
          'machineId': 'skr-m4',
          'threadId': _thread,
          'state': 'sent',
          'createdAt': '2026-11-21T05:00:00.000Z',
        },
      );
      final sent = await repository.reply(
        machineId: 'skr-m4',
        threadId: _thread,
        text: 'Ship it.',
        idempotencyKey: _reply,
      );
      expect(sent.settled, isFalse);
      final call = verify(() => api.postJson(captureAny(), captureAny()));
      expect(call.captured, [
        '/api/v1/mastermind/fleet/replies',
        {
          'machineId': 'skr-m4',
          'threadId': _thread,
          'text': 'Ship it.',
          'idempotencyKey': _reply,
        },
      ]);

      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'id': _reply,
          'machineId': 'skr-m4',
          'threadId': _thread,
          'state': 'delivered',
          'delivery': 'steered',
          'code': 'Not A Code',
          'createdAt': '2026-11-21T05:00:00.000Z',
          'settledAt': '2026-11-21T05:00:01.000Z',
        },
      );
      final receipt = await repository.receipt(_reply);
      expect(captured(), '/api/v1/mastermind/fleet/replies/$_reply');
      expect(receipt.settled, isTrue);
      expect(receipt.steered, isTrue);
      // Only a closed code is kept.
      expect(receipt.code, isNull);
    },
  );

  test('records a read marker', () async {
    when(
      () => api.postJson(any(), any()),
    ).thenAnswer((_) async => {'saved': true});
    final marker = repository.markRead(
      machineId: 'skr-m4',
      environmentId: 'env-2',
      threadId: _thread,
      itemCount: 12,
    );
    expect(await marker, isTrue);
    expect(verify(() => api.postJson(captureAny(), captureAny())).captured, [
      '/api/v1/mastermind/fleet/threads/read',
      {
        'machineId': 'skr-m4',
        'environmentId': 'env-2',
        'threadId': _thread,
        'itemCount': 12,
      },
    ]);
  });

  test('says when a read marker was not saved', () async {
    Future<bool> mark() => repository.markRead(
      machineId: 'skr-m4',
      threadId: _thread,
      itemCount: 12,
    );
    // Web lost a race with another marker: the badge must stay.
    when(
      () => api.postJson(any(), any()),
    ).thenAnswer((_) async => {'saved': false});
    expect(await mark(), isFalse);
    when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
    await expectLater(
      mark(),
      throwsA(
        isA<FleetThreadException>().having(
          (e) => e.failure,
          'failure',
          FleetThreadFailure.unreadable,
        ),
      ),
    );
  });

  test('turns every refusal into a closed state', () async {
    Future<FleetThreadException> failure(Object error) async {
      when(() => api.getJson(any())).thenThrow(error);
      try {
        await repository.threads(machineId: 'skr-m4');
      } on FleetThreadException catch (caught) {
        return caught;
      }
      fail('expected a refusal');
    }

    for (final (message, status, expected, retryable) in [
      ('machine_offline', 503, FleetThreadFailure.machineOffline, true),
      ('timeout', 504, FleetThreadFailure.timeout, true),
      ('unknown_thread', 404, FleetThreadFailure.unknownThread, false),
      ('rate_limited', 429, FleetThreadFailure.rateLimited, true),
      ('budget_exhausted', 429, FleetThreadFailure.rateLimited, true),
      ('mfa_required', 401, FleetThreadFailure.mfaRequired, false),
      ('idempotency_conflict', 409, FleetThreadFailure.conflict, false),
      ('forbidden', 403, FleetThreadFailure.forbidden, false),
      ('invalid_query', 422, FleetThreadFailure.rejected, false),
      (
        'unsupported_for_linked_machine',
        422,
        FleetThreadFailure.rejected,
        false,
      ),
      ('unavailable', 503, FleetThreadFailure.unavailable, true),
      ('Internal Server Error', 500, FleetThreadFailure.unavailable, true),
    ]) {
      final caught = await failure(
        ApiException(message: message, statusCode: status),
      );
      expect(caught.failure, expected, reason: message);
      expect(caught.retryable, retryable, reason: message);
    }
    // Only a closed code is kept; server prose never reaches a screen.
    expect(
      (await failure(
        const ApiException(message: 'machine_offline', statusCode: 503),
      )).code,
      'machine_offline',
    );
    expect(
      (await failure(
        const ApiException(message: 'Internal Server Error', statusCode: 500),
      )).code,
      isNull,
    );
    expect(
      (await failure(
        const ApiException.transport(message: 'Connection unavailable'),
      )).failure,
      FleetThreadFailure.unavailable,
    );
    expect(
      (await failure(
        const ApiException(
          message: 'verification_required',
          statusCode: 403,
          isVerificationRequired: true,
        ),
      )).failure,
      FleetThreadFailure.challenged,
    );
  });

  test('refuses a body that is not in the documented shape', () async {
    for (final body in <Map<String, dynamic>>[
      {},
      {
        'machineId': 'skr-m4',
        'threads': 'none',
        'nextCursor': null,
        'total': 0,
      },
      {
        'machineId': 'skr-m4',
        'threads': [
          _threadJson({'state': 'exploded'}),
        ],
        'nextCursor': null,
        'total': 1,
      },
      {
        'machineId': 'skr-m4',
        'threads': [
          _threadJson({'threadId': 'has space'}),
        ],
        'nextCursor': null,
        'total': 1,
      },
      {
        'machineId': 'skr-m4',
        'threads': [
          _threadJson({'itemCount': -1}),
        ],
        'nextCursor': null,
        'total': 1,
      },
    ]) {
      when(() => api.getJson(any())).thenAnswer((_) async => body);
      await expectLater(
        repository.threads(machineId: 'skr-m4'),
        throwsA(
          isA<FleetThreadException>().having(
            (e) => e.failure,
            'failure',
            FleetThreadFailure.unreadable,
          ),
        ),
      );
    }
  });
}
