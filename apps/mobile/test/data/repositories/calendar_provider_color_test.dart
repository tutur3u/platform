import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/google_calendar_color.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

class _Api extends ApiClient {
  final paths = <String>[];
  List<Map<String, dynamic>> sources = [];
  Map<String, dynamic>? body;
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    paths.add(path);
    if (path.endsWith('default-source')) return {'options': sources};
    return {
      'provider': 'google',
      'connectionId': 'connection',
      'providerColorWrites': true,
      'options': <Object?>[],
    };
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? data, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    body = data! as Map<String, dynamic>;
    throw const ApiException(message: 'Uncertain send', statusCode: 0);
  }

  @override
  Future<Map<String, dynamic>> putJson(
    String path,
    Map<String, dynamic> data, {
    bool requiresAuth = true,
  }) async {
    paths.add(path);
    body = data;
    throw const ApiException(message: 'Synthetic offline', statusCode: 0);
  }
}

class _Queue extends Fake implements OfflineMutationQueue {
  Map<String, dynamic>? failedPayload;
  bool? safe;
  @override
  Future<bool> enqueueIfOffline({
    required String feature,
    required String method,
    required String path,
    required String workspaceId,
    Map<String, dynamic>? payload,
    String? entityId,
    bool replaySafe = false,
  }) async => false;
  @override
  Future<bool> enqueueAfterNetworkFailure({
    required ApiException error,
    required String feature,
    required String method,
    required String path,
    required String workspaceId,
    required Map<String, dynamic> payload,
    required String entityId,
    required bool replaySafe,
  }) async {
    failedPayload = payload;
    safe = replaySafe;
    return true;
  }
}

void main() {
  const event = CalendarEvent(
    id: 'event',
    title: 'Title',
    provider: 'google',
    sourceCalendarId: 'workspace-calendar',
  );
  test(
    'fresh canonical source resolves connection; ambiguous matches fail closed',
    () async {
      final api = _Api()
        ..sources = [
          {
            'provider': 'google',
            'workspaceCalendarId': 'workspace-calendar',
            'connectionId': 'connection',
          },
        ];
      final repo = CalendarRepository(apiClient: api);
      final colors = await repo.getGoogleColorOptionsForEvent(
        'workspace',
        event,
      );
      expect(colors!.connectionId, 'connection');
      expect(api.paths, [
        '/api/v1/workspaces/workspace/calendar/default-source',
        '/api/v1/workspaces/workspace/calendar/colors?connectionId=connection',
      ]);
      api.sources.add({...api.sources.single, 'connectionId': 'other'});
      api.paths.clear();
      expect(
        await repo.getGoogleColorOptionsForEvent('workspace', event),
        isNull,
      );
      expect(api.paths, hasLength(1));
      api.dispose();
    },
  );
  test(
    'mismatched workspace calendar cannot substitute external identifier',
    () async {
      final api = _Api()
        ..sources = [
          {
            'provider': 'google',
            'workspaceCalendarId': 'other',
            'externalCalendarId': 'workspace-calendar',
            'connectionId': 'connection',
          },
        ];
      expect(
        await CalendarRepository(
          apiClient: api,
        ).getGoogleColorOptionsForEvent('workspace', event),
        isNull,
      );
      expect(api.paths, hasLength(1));
      api.dispose();
    },
  );
  test(
    'offline provider write surfaces failure and sends only color',
    () async {
      final api = _Api();
      await expectLater(
        CalendarRepository(apiClient: api).updateProviderColor(
          'workspace',
          'event',
          const GoogleCalendarColorChoice(
            connectionId: 'connection',
            kind: 'label',
            id: 'label-one',
          ),
        ),
        throwsA(isA<ApiException>()),
      );
      expect(api.body, {
        'providerColor': {
          'connectionId': 'connection',
          'kind': 'label',
          'id': 'label-one',
        },
      });
      expect(api.paths, ['/api/v1/workspaces/workspace/calendar/events/event']);
      api.dispose();
    },
  );
  test('uncertain POST retains request ID for manual replay', () async {
    final api = _Api();
    final queue = _Queue();
    final repo = CalendarRepository(apiClient: api, offlineQueue: queue);
    await repo.createEvent('workspace', {'title': 'Synthetic draft'});
    expect(queue.failedPayload!['requestId'], api.body!['requestId']);
    expect(queue.safe, isFalse);
    final record = PendingMutationRecord(
      id: 'queue-id',
      feature: 'calendar',
      method: 'POST',
      path: '/events',
      createdAt: DateTime.utc(2026),
      payload: queue.failedPayload,
      status: PendingMutationStatus.conflict,
    );
    final manualRetry = PendingMutationRecord.fromJson(
      record.toJson(),
    ).copyWith(status: PendingMutationStatus.queued, attemptCount: 1);
    expect(manualRetry.payload!['requestId'], api.body!['requestId']);
    api.dispose();
  });
  test('creation draft identifiers use UUIDv7 and secure variant', () {
    final first = newLocalMutationId(timeOrdered: true);
    final second = newLocalMutationId(timeOrdered: true);
    expect(
      first,
      matches(
        RegExp(
          '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-'
          r'[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      ),
    );
    expect(first, isNot(second));
  });
}
