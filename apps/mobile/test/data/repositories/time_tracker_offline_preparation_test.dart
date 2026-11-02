import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/repositories/time_tracker_offline_preparation.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Api extends Mock implements ApiClient {}

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final master in [false, true]) {
    for (final enabled in [false, true]) {
      test('registration master=$master timeTracker=$enabled', () async {
        final registry = OfflinePreparerRegistry(
          isEnabled: (flag) =>
              flag == MobileFlag.mobileOffline ? master : enabled,
        );
        var calls = 0;
        TimeTrackerOfflinePreparation.register(registry, (_) async {
          calls++;
        });
        expect(registry.containsKey('time_tracker'), master && enabled);
        await registry['time_tracker']?.call('ws');
        expect(calls, master && enabled ? 1 : 0);
      });
    }
  }
  late Directory directory;
  late CacheStore store;
  late _Api api;
  var owner = 'user';
  const base = '/api/v1/workspaces/ws/time-tracking';
  const listPath = '$base/categories';
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    directory = await Directory.systemTemp.createTemp('habits-offline-');
    final storage = _Storage();
    final secrets = <String, String>{};
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    await store.init();
    owner = 'user';
    api = _Api();
    when(() => api.checkUser(any())).thenReturn(null);
    when(() => api.getJson(any())).thenAnswer((call) async {
      final path = call.positionalArguments.first as String;
      return path == listPath
          ? {
              'categories': [
                {'id': 'cat'},
              ],
            }
          : {'sessions': <dynamic>[], 'session': null};
    });
  });
  tearDown(() async {
    await CacheStore.instance.closeForTesting();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare({int firstDay = DateTime.monday}) =>
      TimeTrackerOfflinePreparation(
        api: api,
        firstDayOfWeek: firstDay,
        store: store,
        currentUser: () => owner,
      ).prepare('ws');

  test(
    'bounded download opens both first pages offline through read-through',
    () async {
      await prepare();
      verify(() => api.getJson(any())).called(8);
      when(
        () => api.getJson(any()),
      ).thenThrow(const SocketException('offline'));
      final repository = TimeTrackerRepository(
        apiClient: api,
        cacheStore: store,
        cacheUserId: () => owner,
      );
      final categories = await repository.getCategories('ws');
      final sessions = await repository.getSessions('ws', limit: 5);
      expect(categories.single.id, 'cat');
      expect(sessions, isEmpty);
      await Future<void>.delayed(Duration.zero);
    },
  );
  for (final firstDay in [
    DateTime.monday,
    DateTime.sunday,
    DateTime.saturday,
  ]) {
    test(
      'cold TimeTrackerCubit opens prepared history and period stats offline '
      'firstDay=$firstDay',
      () async {
        when(() => api.getJson(any())).thenAnswer((call) async {
          final path = call.positionalArguments.first as String;
          if (path == listPath) {
            return {
              'categories': [
                {'id': 'cat'},
              ],
            };
          }
          if (path.contains('/stats/period?')) return {'totalDuration': 900};
          return {
            'sessions': <dynamic>[],
            'session': null,
            'hasMore': true,
            'nextCursor': 'next',
          };
        });
        await prepare(firstDay: firstDay);
        when(
          () => api.getJson(any()),
        ).thenThrow(const SocketException('offline'));

        final cubit = TimeTrackerCubit(
          repository: TimeTrackerRepository(
            apiClient: api,
            cacheStore: store,
            cacheUserId: () => owner,
          ),
          cacheStore: store,
          currentUserId: () => owner,
        );
        addTearDown(cubit.close);
        await cubit.loadData('ws', owner, firstDayOfWeek: firstDay);
        expect(cubit.state.status, TimeTrackerStatus.loaded);
        expect(cubit.state.error, isNull);
        expect(cubit.state.historyPeriodStats?.totalDuration, 900);
        expect(cubit.state.historyNextCursor, 'next');
      },
    );
  }
  test(
    'older history cursor page survives bounded preparation offline',
    () async {
      final from = DateTime(2026, 1, 5);
      final to = DateTime(2026, 1, 11, 23, 59, 59);
      final path =
          '$base/sessions?${Uri(queryParameters: {'type': 'history', 'limit': '10', 'dateFrom': from.toUtc().toIso8601String(), 'dateTo': to.toUtc().toIso8601String(), 'cursor': 'old-page', 'userId': owner}).query}';
      await store.write(
        key: CacheKey(
          namespace: 'time_tracker.data',
          userId: owner,
          workspaceId: 'ws',
          params: {'path': path},
        ),
        policy: CachePolicies.moduleData,
        payload: {
          'sessions': <dynamic>[],
          'hasMore': true,
          'nextCursor': 'older',
        },
      );
      await prepare();
      when(
        () => api.getJson(any()),
      ).thenThrow(const SocketException('offline'));
      final page =
          await TimeTrackerRepository(
            apiClient: api,
            cacheStore: store,
            cacheUserId: () => owner,
          ).getHistorySessions(
            'ws',
            dateFrom: from,
            dateTo: to,
            cursor: 'old-page',
            userId: owner,
          );
      expect(page.nextCursor, 'older');
    },
  );

  test('oversized response fails preparation', () async {
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'categories': <dynamic>[],
        'padding': 'x' * (TimeTrackerOfflinePreparation.maxBytes + 1),
      },
    );
    await expectLater(prepare(), throwsA(isA<OfflinePreparationUnavailable>()));
  });
  test('over item cap stores no partial response', () async {
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'trackers': List.generate(
          201,
          (i) => {
            'tracker': {'id': '$i'},
          },
        ),
      },
    );
    await expectLater(prepare(), throwsA(isA<OfflinePreparationUnavailable>()));
    expect(
      store
          .peek<Map<String, dynamic>>(
            key: CacheKey(
              namespace: 'time_tracker.data',
              userId: owner,
              workspaceId: 'ws',
              params: {'path': listPath},
            ),
            decode: (value) => Map<String, dynamic>.from(value! as Map),
          )
          .hasValue,
      isFalse,
    );
  });
  test('account switch during response prevents publication', () async {
    when(() => api.getJson(listPath)).thenAnswer((_) async {
      owner = 'other';
      return {'categories': <dynamic>[]};
    });
    await expectLater(prepare(), throwsStateError);
  });
}
