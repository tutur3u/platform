import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  test(
    'task preparation awaits required lookup and task detail failures',
    () async {
      final api = _MockApiClient();
      when(() => api.getJsonList(any())).thenAnswer((_) async => []);
      when(() => api.getJson(any())).thenAnswer((invocation) async {
        final path = invocation.positionalArguments.first as String;
        if (path == '/api/v1/workspaces/ws/tasks?limit=200&offset=0') {
          return {
            'tasks': [
              {'id': 'one'},
            ],
          };
        }
        if (path == '/api/v1/workspaces/ws/tasks/one') {
          throw const ApiException(message: 'Unavailable', statusCode: 503);
        }
        return <String, dynamic>{
          'boards': <Map<String, dynamic>>[],
          'tasks': <Map<String, dynamic>>[],
          'completed': <Map<String, dynamic>>[],
          'hasMoreCompleted': false,
        };
      });
      final repository = TaskRepository(apiClient: api);
      await expectLater(
        repository.prepareOffline('ws', cacheUserId: () => 'prepare-user'),
        throwsA(isA<ApiException>()),
      );
      verify(() => api.getJson('/api/v1/workspaces/ws/members')).called(1);
      verify(() => api.getJson('/api/v1/workspaces/ws/tasks/one')).called(1);
    },
  );
  test(
    'empty accessible task collections finish after awaited server reads',
    () async {
      final api = _MockApiClient();
      when(() => api.getJson(any())).thenAnswer(
        (_) async => <String, dynamic>{
          'boards': <Map<String, dynamic>>[],
          'tasks': <Map<String, dynamic>>[],
          'completed': <Map<String, dynamic>>[],
          'hasMoreCompleted': false,
        },
      );
      when(() => api.getJsonList(any())).thenAnswer((_) async => []);
      final repository = TaskRepository(apiClient: api);
      await repository.prepareOffline('ws', cacheUserId: () => 'prepare-user');
      verify(
        () => api.getJson(
          '/api/v1/workspaces/ws/tasks?forTimeTracking=true&includeCount=true&assignedToMe=true&limit=200&offset=0',
        ),
      ).called(1);
    },
  );
  test(
    'calendar preparation fetches full date span and connection metadata',
    () async {
      final api = _MockApiClient();
      final paths = <String>[];
      when(() => api.getJson(any())).thenAnswer((invocation) async {
        final path = invocation.positionalArguments.first as String;
        paths.add(path);
        return {
          'data': <Map<String, dynamic>>[],
          'has_more': false,
          'accounts': <Map<String, dynamic>>[],
          'connections': <Map<String, dynamic>>[],
        };
      });
      final repository = CalendarRepository(apiClient: api);
      await repository.prepareOffline(
        'prepare-calendar',
        cacheUserId: () => 'prepare-user',
      );
      final events = Uri.parse(paths.first);
      expect(events.queryParameters['start_at'], '0001-01-01T00:00:00.000Z');
      expect(events.queryParameters['end_at'], '9999-12-31T23:59:59.999Z');
      expect(events.queryParameters['page_size'], '200');
      expect(
        paths,
        contains('/api/v1/calendar/connections?wsId=prepare-calendar'),
      );
      repository.dispose();
    },
  );
  test(
    'calendar download awaits later pages and refuses a repeated cursor',
    () async {
      final api = _MockApiClient();
      final cursors = <String?>[];
      when(() => api.getJson(any())).thenAnswer((invocation) async {
        final uri = Uri.parse(invocation.positionalArguments.first as String);
        cursors.add(uri.queryParameters['cursor']);
        return {
          'data': <Map<String, dynamic>>[],
          'has_more': true,
          'next_cursor': 'same-cursor',
        };
      });
      final repository = CalendarRepository(apiClient: api);
      await expectLater(
        repository.prepareOffline(
          'cursor-calendar',
          cacheUserId: () => 'prepare-user',
        ),
        throwsStateError,
      );
      expect(cursors, [null, 'same-cursor']);
      repository.dispose();
    },
  );
  test(
    'calendar cursor pages persist together for local range lookup',
    () async {
      final api = _MockApiClient();
      final queries = <Map<String, String>>[];
      const cursor = '{"start_at":"2026-10-02T00:00:00.000Z","id":"first"}';
      when(() => api.getJson(any())).thenAnswer((invocation) async {
        final uri = Uri.parse(invocation.positionalArguments.first as String);
        if (!uri.path.endsWith('/events')) {
          return <String, dynamic>{};
        }
        queries.add(uri.queryParameters);
        final first = uri.queryParameters['cursor'] == null;
        return {
          'data': <Map<String, dynamic>>[
            {
              'id': first ? 'first' : 'second',
              'start_at': '2026-10-02T00:00:00.000Z',
              'end_at': '2026-10-02T01:00:00.000Z',
            },
          ],
          'has_more': first,
          'next_cursor': first ? cursor : null,
        };
      });
      final repository = CalendarRepository(apiClient: api);
      await repository.prepareOffline(
        'paged-calendar',
        cacheUserId: () => 'prepare-user',
      );
      expect(queries.length, 2);
      expect(queries.last['cursor'], cursor);
      expect(queries.every((query) => query['page_size'] == '200'), isTrue);
      final rows = await CacheStore.instance.queryReplica(
        namespace: 'calendar.events',
        userId: 'prepare-user',
        workspaceId: 'paged-calendar',
      );
      expect(rows.map((row) => row.id).toSet(), {'first', 'second'});
      repository.dispose();
    },
  );
  test(
    'calendar read aborts an account switch before persisting the response',
    () async {
      var actor = 'calendar-account-a';
      final api = _MockApiClient();
      when(() => api.getJson(any())).thenAnswer((_) async {
        actor = 'calendar-account-b';
        return {
          'data': [
            {
              'id': 'private-a',
              'start_at': '2026-10-02T00:00:00Z',
              'end_at': '2026-10-02T01:00:00Z',
            },
          ],
        };
      });
      final repository = CalendarRepository(
        apiClient: api,
        currentUserId: () => actor,
      );
      await expectLater(
        repository.getEvents('account-race'),
        throwsA(isA<ApiException>()),
      );
      final stored = await CacheStore.instance.read<Object?>(
        key: const CacheKey(
          namespace: 'calendar.events',
          userId: 'calendar-account-a',
          workspaceId: 'account-race',
          params: {'query': ''},
        ),
        decode: (value) => value,
      );
      expect(stored.hasValue, isFalse);
      repository.dispose();
    },
  );
}
