import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/data/repositories/calendar_series_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

const seriesId = '6f1f6b2e-8a52-4d47-9b0e-3f4c2a1d9e7b';

Map<String, dynamic> occurrenceJson({
  String id = 'occurrence-1',
  bool allDay = false,
  Map<String, dynamic>? providerSource,
}) => {
  'id': id,
  'title': 'Synthetic standup',
  'start_at': '2026-11-23T02:00:00Z',
  'end_at': '2026-11-23T02:30:00Z',
  'is_all_day': allDay,
  'ws_id': 'ws',
  'provider': 'tuturuuu',
  'seriesId': seriesId,
  'seriesRevision': 3,
  'originalStartLocal': '2026-11-23T09:00:00',
  'isException': false,
  'providerSource': ?providerSource,
  'recurrence': {
    'version': 1,
    'frequency': 'weekly',
    'interval': 1,
    'timeZone': 'Asia/Ho_Chi_Minh',
    'weekdays': ['MO'],
    'end': {'type': 'never'},
  },
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Api api;
  var online = true;
  late CalendarSeriesRepository repository;
  final from = DateTime.utc(2026, 11);
  final to = DateTime.utc(2026, 12);

  setUpAll(() => registerFallbackValue(<String, dynamic>{}));
  setUp(() async {
    await CacheStore.instance.clearScope();
    api = _Api();
    online = true;
    repository = CalendarSeriesRepository(
      apiClient: api,
      currentUserId: () => null,
      isOnline: () async => online,
    );
  });
  tearDown(CacheStore.instance.clearScope);

  test('reads occurrences in one bounded range request', () async {
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'data': [occurrenceJson(), occurrenceJson(id: 'occurrence-2')],
      },
    );
    final occurrences = await repository.listOccurrences(
      'ws',
      from: from,
      to: to,
    );
    expect(occurrences.map((o) => o.event.id), [
      'occurrence-1',
      'occurrence-2',
    ]);
    expect(occurrences.first.event.isAllDay, isFalse);
    final path =
        verify(() => api.getJson(captureAny())).captured.single as String;
    final uri = Uri.parse(path);
    expect(uri.path, '/api/v1/workspaces/ws/calendar/series');
    expect(uri.queryParameters, {
      'from': '2026-11-01T00:00:00.000Z',
      'to': '2026-12-01T00:00:00.000Z',
      'limit': '1000',
    });
  });

  test('offline reads return the last stored range', () async {
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'data': [occurrenceJson()],
      },
    );
    await repository.listOccurrences('ws', from: from, to: to);
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException.transport(message: 'Offline'));
    final retained = await repository.listOccurrences('ws', from: from, to: to);
    expect(retained.single.event.id, 'occurrence-1');
  });

  test('permission denial removes stored occurrences', () async {
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'data': [occurrenceJson()],
      },
    );
    await repository.listOccurrences('ws', from: from, to: to);
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException(message: 'Denied', statusCode: 403));
    await expectLater(
      repository.listOccurrences('ws', from: from, to: to),
      throwsA(isA<ApiException>()),
    );
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException.transport(message: 'Offline'));
    await expectLater(
      repository.listOccurrences('ws', from: from, to: to),
      throwsA(isA<ApiException>()),
    );
  });

  test('provider-backed occurrences parse as read-only', () {
    final occurrence = CalendarSeriesOccurrence.fromJson(
      occurrenceJson(
        allDay: true,
        providerSource: {'provider': 'google', 'connectionId': 'c'},
      ),
    );
    expect(occurrence.isProviderSeries, isTrue);
    expect(occurrence.event.isAllDay, isTrue);
    expect(occurrence.rule.weekdays, ['MO']);
  });

  test('creates a series with its request id, rule and anchor', () async {
    when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
    const rule = CalendarRecurrenceRule(
      frequency: CalendarRecurrenceFrequency.daily,
      timeZone: 'Asia/Ho_Chi_Minh',
    );
    const anchor = CalendarRecurrenceAnchor(
      startLocal: '2026-11-23T09:00:00',
      endLocal: '2026-11-23T09:30:00',
      allDay: false,
    );
    await repository.createSeries(
      'ws',
      requestId: 'request',
      rule: rule,
      anchor: anchor,
      event: {'title': 'Synthetic standup'},
    );
    final captured = verify(
      () => api.postJson(captureAny(), captureAny()),
    ).captured;
    expect(captured[0], '/api/v1/workspaces/ws/calendar/series');
    expect(captured[1], {
      'requestId': 'request',
      'rule': {
        'version': 1,
        'frequency': 'daily',
        'interval': 1,
        'timeZone': 'Asia/Ho_Chi_Minh',
        'end': {'type': 'never'},
      },
      'anchor': anchor.toJson(),
      'event': {'title': 'Synthetic standup'},
    });
  });

  test('a single occurrence update never sends a rule', () async {
    when(() => api.putJson(any(), any())).thenAnswer((_) async => {});
    await repository.mutateSeries(
      'ws',
      seriesId,
      delete: false,
      requestId: 'request',
      expectedRevision: 3,
      scope: CalendarRecurrenceScope.occurrence,
      originalStartLocal: '2026-11-23T09:00:00',
      event: {'title': 'Moved'},
      rule: const CalendarRecurrenceRule(
        frequency: CalendarRecurrenceFrequency.daily,
        timeZone: 'UTC',
      ),
    );
    final captured = verify(
      () => api.putJson(captureAny(), captureAny()),
    ).captured;
    expect(captured[0], '/api/v1/workspaces/ws/calendar/series/$seriesId');
    expect(captured[1], {
      'requestId': 'request',
      'expectedRevision': 3,
      'scope': 'this',
      'originalStartLocal': '2026-11-23T09:00:00',
      'event': {'title': 'Moved'},
    });
  });

  test('a scoped delete sends only its identity', () async {
    when(
      () => api.deleteJson(any(), body: any(named: 'body')),
    ).thenAnswer((_) async => {});
    await repository.mutateSeries(
      'ws',
      seriesId,
      delete: true,
      requestId: 'request',
      expectedRevision: 3,
      scope: CalendarRecurrenceScope.future,
      originalStartLocal: '2026-11-30T09:00:00',
      event: {'title': 'Ignored'},
    );
    final body = verify(
      () => api.deleteJson(any(), body: captureAny(named: 'body')),
    ).captured.single;
    expect(body, {
      'requestId': 'request',
      'expectedRevision': 3,
      'scope': 'future',
      'originalStartLocal': '2026-11-30T09:00:00',
    });
  });

  test('writes require a connection and are never queued', () async {
    online = false;
    await expectLater(
      repository.mutateSeries(
        'ws',
        seriesId,
        delete: true,
        requestId: 'request',
        expectedRevision: 3,
        scope: CalendarRecurrenceScope.series,
        originalStartLocal: '2026-11-23T09:00:00',
      ),
      throwsA(
        isA<ApiException>().having(
          (e) => e.failureKind,
          'failureKind',
          ApiFailureKind.transport,
        ),
      ),
    );
    verifyNever(() => api.deleteJson(any(), body: any(named: 'body')));
  });
}
