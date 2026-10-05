import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const key = CacheKey(
    namespace: 'calendar.events',
    workspaceId: 'ws',
    params: {'query': ''},
  );
  const old = {'id': 'old', 'title': 'Retained event'};
  late _Api api;
  late CalendarRepository repository;
  setUp(() async {
    await CacheStore.instance.clearScope();
    api = _Api();
    repository = CalendarRepository(apiClient: api, currentUserId: () => null);
    await CacheStore.instance.write(
      key: key,
      policy: CachePolicies.moduleData,
      payload: [old],
    );
  });
  tearDown(() async {
    repository.dispose();
    await CacheStore.instance.clearScope();
  });

  test(
    'fresh disk snapshot does not suppress an awaited calendar refresh',
    () async {
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'data': [
            {'id': 'new', 'title': 'Fresh event'},
          ],
        },
      );
      final events = await CacheStore.awaitRevalidation(
        () => repository.getEvents('ws'),
      );
      expect(events.single.id, 'new');
      verify(
        () => api.getJson('/api/v1/workspaces/ws/calendar/events'),
      ).called(1);
    },
  );

  test(
    'transport failure retains the stored calendar for offline reads',
    () async {
      when(
        () => api.getJson(any()),
      ).thenThrow(const ApiException.transport(message: 'Offline'));
      final events = await CacheStore.awaitRevalidation(
        () => repository.getEvents('ws'),
      );
      expect(events.single.id, 'old');
    },
  );

  test(
    'permission denial removes all stored calendar event projections',
    () async {
      when(
        () => api.getJson(any()),
      ).thenThrow(const ApiException(message: 'Denied', statusCode: 403));
      await expectLater(
        CacheStore.awaitRevalidation(() => repository.getEvents('ws')),
        throwsA(isA<ApiException>()),
      );
      expect(
        (await CacheStore.instance.read<Object?>(
          key: key,
          decode: (value) => value,
        )).hasValue,
        isFalse,
      );
    },
  );
}
