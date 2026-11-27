import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/utils/contact_session_edit.dart';

void main() {
  test(
    'decodes the persisted ID, recurrence and independent endpoint zones',
    () {
      final session = CrmSession.fromJson(const {
        'id': 'fb876acd-d1c1-4000-9331-133c83fdbe23',
        'seriesId': 'series',
        'startTimezone': 'Asia/Ho_Chi_Minh',
        'endTimezone': 'Asia/Tokyo',
      });
      expect(session.isPersisted, isTrue);
      expect(session.seriesId, 'series');
      expect(session.startTimezone, 'Asia/Ho_Chi_Minh');
      expect(session.endTimezone, 'Asia/Tokyo');
      expect(
        CrmSession.fromJson(const {'id': 'projected:2026-11-27'}).isPersisted,
        isFalse,
      );
    },
  );

  test('edits an instant in the stored timezone across an offset change', () {
    final start = contactSessionEditTime(
      '2026-03-07T15:15:42Z',
      'America/New_York',
    )!;
    expect(start.hour, 10);
    expect(
      contactSessionEditWallTime(start, hour: 10, minute: 15),
      same(start),
    );
    final changed = contactSessionEditWallTime(
      start,
      date: DateTime(2026, 3, 8),
    );
    expect(changed?.toUtc(), DateTime.utc(2026, 3, 8, 14, 15));
  });

  test(
    'rejects nonexistent wall times and unrecognized timezone identifiers',
    () {
      final start = contactSessionEditTime(
        '2026-03-08T06:30:00Z',
        'America/New_York',
      )!;
      expect(contactSessionEditWallTime(start, hour: 2), isNull);
      expect(
        contactSessionEditTime('2026-03-08T06:30:00Z', 'Invalid/Zone'),
        isNull,
      );
    },
  );

  group('occurrence PUT', () {
    late _GuardedApi api;
    late CrmRepository repository;
    const id = 'fb876acd-d1c1-4000-9331-133c83fdbe23';
    final start = DateTime.utc(2026, 11, 27, 9);
    final end = DateTime.utc(2026, 11, 27, 10);

    setUp(() {
      api = _GuardedApi();
      repository = CrmRepository(apiClient: api);
      addTearDown(repository.dispose);
    });

    Future<void> update({
      String sessionId = id,
      DateTime? endsAt,
      Future<void> Function()? guard,
    }) => repository.updateSessionOccurrence(
      'workspace',
      actorId: 'actor',
      session: CrmSession(
        id: sessionId,
        groupId: 'group',
        startsAt: start.toIso8601String(),
        endsAt: end.toIso8601String(),
        startTimezone: 'Asia/Tokyo',
        endTimezone: 'Asia/Ho_Chi_Minh',
      ),
      title: '  Morning class  ',
      startsAt: start,
      endsAt: endsAt ?? end,
      beforeDispatch: guard ?? () async {},
    );

    test('sends one occurrence and preserves zones', () async {
      // Stop after dispatch to keep this test independent of platform storage.
      await expectLater(update(), throwsA(same(api.responseFailure)));
      expect(api.actor, 'actor');
      expect(api.path, '/api/v1/workspaces/workspace/user-groups/sessions/$id');
      expect(api.body, {
        'scope': 'once',
        'title': 'Morning class',
        'startsAt': '2026-11-27T09:00:00.000Z',
        'endsAt': '2026-11-27T10:00:00.000Z',
      });
    });

    test('refuses invalid ranges and projected IDs before dispatch', () async {
      await expectLater(update(endsAt: start), throwsArgumentError);
      await expectLater(update(sessionId: 'projected'), throwsArgumentError);
      expect(api.path, isNull);
    });

    test('refuses dispatch when the caller loses its scope', () async {
      final denied = StateError('Scope changed');
      await expectLater(
        update(guard: () async => throw denied),
        throwsA(same(denied)),
      );
      expect(api.path, isNull);
      expect(api.actor, isNull);
    });
  });
}

class _GuardedApi extends Fake implements ApiClient {
  final responseFailure = StateError('Response unavailable');
  String? actor;
  String? path;
  Map<String, dynamic>? body;

  @override
  void dispose() {}

  @override
  void checkUser(String expectedUserId) => actor = expectedUserId;

  @override
  Future<Map<String, dynamic>> putJsonGuarded(
    String path,
    Map<String, dynamic> body, {
    required Future<void> Function() beforeDispatch,
  }) async {
    await beforeDispatch();
    this.path = path;
    this.body = body;
    throw responseFailure;
  }
}
