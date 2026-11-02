import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/data/repositories/habits_offline_preparation.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_snapshot_access.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Queue extends Mock implements OfflineMutationQueue {}

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final master in [false, true]) {
    for (final enabled in [false, true]) {
      test('registration master=$master habits=$enabled', () async {
        final registry = OfflinePreparerRegistry(
          isEnabled: (flag) =>
              flag == MobileFlag.mobileOffline ? master : enabled,
        );
        var calls = 0;
        HabitsOfflinePreparation.register(registry, (_) async {
          calls++;
        });
        expect(registry.containsKey('habits'), master && enabled);
        await registry['habits']?.call('ws');
        expect(calls, master && enabled ? 1 : 0);
        final coordinator = OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
          registry: registry,
        );
        await coordinator.run(userId: 'user', workspaceId: 'ws');
        expect(
          coordinator.state.value.products['habits']?.lastSuccess != null,
          master && enabled,
        );
        coordinator.state.dispose();
      });
    }
  }
  test('disabling removes a previous registration', () {
    var enabled = true;
    final registry = OfflinePreparerRegistry(isEnabled: (_) => enabled);
    HabitsOfflinePreparation.register(registry, (_) async {});
    enabled = false;
    HabitsOfflinePreparation.register(registry, (_) async {});
    expect(registry.appKeys, isEmpty);
  });

  late Directory directory;
  late CacheStore store;
  late _Api api;
  late HabitsSnapshotAccess access;
  var owner = 'user';
  const base = '/api/v1/workspaces/ws/habit-trackers';
  const listPath = '$base?scope=self';
  setUp(() async {
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
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      secrets.remove(call.namedArguments[#key]);
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    await store.init();
    access = HabitsSnapshotAccess(store, storage: storage);
    owner = 'user';
    api = _Api();
    when(() => api.checkUser(any())).thenReturn(null);
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'trackers': List.generate(
          2,
          (i) => {
            'tracker': {'id': 'c$i', 'ws_id': 'ws'},
          },
        ),
      },
    );
    for (var i = 0; i < 2; i++) {
      when(() => api.getJson('$base/c$i?scope=self')).thenAnswer(
        (_) async => {
          'tracker': {'id': 'c$i', 'ws_id': 'ws'},
          'entries': [
            {
              'id': 'entry$i',
              'ws_id': 'ws',
              'tracker_id': 'c$i',
              'user_id': 'user',
              'entry_kind': 'event_log',
              'entry_date': '2026-11-02',
              'primary_value': 1,
            },
          ],
        },
      );
    }
  });
  tearDown(() async {
    HabitsCubit.clearCache();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => HabitsOfflinePreparation(
    api: api,
    snapshotAccess: access,
    store: store,
    currentUser: () => owner,
  ).prepare('ws');

  test(
    'bounded download opens both first pages offline through read-through',
    () async {
      await prepare();
      verify(() => api.getJson(any())).called(3);
      when(
        () => api.getJson(any()),
      ).thenThrow(const SocketException('offline'));
      final queue = _Queue();
      when(queue.listPending).thenAnswer((_) async => []);
      final repository = HabitTrackerRepository(
        apiClient: api,
        cacheStore: store,
        currentUserId: () => owner,
        mutationQueue: queue,
      );
      final list = await repository.listTrackers('ws');
      final detail = await repository.getTrackerDetail('ws', 'c0');
      expect(list.trackers.map((row) => row.tracker.id), ['c0', 'c1']);
      expect(detail.tracker.id, 'c0');
      expect(detail.entries.single.id, 'entry0');
      await Future<void>.delayed(Duration.zero);
    },
  );
  HabitsCubit coldCubit() {
    HabitsCubit.clearCache();
    final queue = _Queue();
    when(queue.listPending).thenAnswer((_) async => []);
    final cubit = HabitsCubit(
      repository: HabitTrackerRepository(
        apiClient: api,
        cacheStore: store,
        currentUserId: () => owner,
        mutationQueue: queue,
      ),
      cacheStore: store,
      currentUserId: () => owner,
      snapshotAccess: access,
    );
    addTearDown(cubit.close);
    return cubit;
  }

  test(
    'cold HabitsCubit opens prepared self list and detail offline',
    () async {
      await prepare();
      when(
        () => api.getJson(any()),
      ).thenThrow(const SocketException('offline'));
      final cubit = coldCubit();
      await cubit.loadWorkspace('ws');
      await cubit.loadTrackerDetail('c0');
      expect(cubit.state.status, HabitsStatus.loaded);
      expect(cubit.state.error, isNull);
      expect(cubit.state.trackers.map((card) => card.tracker.id), ['c0', 'c1']);
      expect(cubit.state.detailStatus, HabitsStatus.loaded);
      expect(cubit.state.detail?.tracker.id, 'c0');
      expect(cubit.state.detailError, isNull);
      expect(cubit.state.detail?.entries.single.id, 'entry0');
      expect(cubit.state.isFromCache, isTrue);
      await cubit.loadActivity();
      expect(cubit.state.activityEntries, hasLength(2));
      expect(cubit.state.activityStatus, HabitsStatus.loaded);
      expect(cubit.state.activityError, isNull);
    },
  );
  test('prepared Habits snapshot is revoked by a fresh 403', () async {
    await prepare();
    when(() => api.getJson(any())).thenThrow(const SocketException('offline'));
    final cubit = coldCubit();
    await cubit.loadWorkspace('ws');
    expect(cubit.state.trackers, hasLength(2));
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException(message: 'Forbidden', statusCode: 403));
    await cubit.loadWorkspace('ws', refresh: true);
    expect(cubit.state.listResponse, isNull);
    when(() => api.getJson(any())).thenThrow(const SocketException('offline'));
    final reopened = coldCubit();
    await reopened.loadWorkspace('ws');
    expect(reopened.state.trackers, isEmpty);
    expect(reopened.state.status, HabitsStatus.error);
  });
  test(
    'revocation during preparation cannot publish an authorized snapshot',
    () async {
      final key = CacheKey(
        namespace: 'habits.workspace',
        userId: owner,
        workspaceId: 'ws',
      );
      when(() => api.getJson('$base/c1?scope=self')).thenAnswer((_) async {
        await access.revoke(
          key,
          const ApiException(message: 'Forbidden', statusCode: 403),
          () {},
        );
        return {
          'tracker': {'id': 'c1', 'ws_id': 'ws'},
          'entries': <dynamic>[],
        };
      });
      await expectLater(prepare(), throwsA(isA<ApiException>()));
      expect(await access.canRead(key), isFalse);
      when(
        () => api.getJson(any()),
      ).thenThrow(const SocketException('offline'));
      final cubit = coldCubit();
      await cubit.loadWorkspace('ws');
      expect(cubit.state.trackers, isEmpty);
      expect(cubit.state.status, HabitsStatus.error);
    },
  );
  test('oversized response fails preparation', () async {
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'trackers': <dynamic>[],
        'padding': 'x' * (HabitsOfflinePreparation.maxBytes + 1),
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
              namespace: 'habits.trackers',
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
      return {'trackers': <dynamic>[]};
    });
    await expectLater(prepare(), throwsStateError);
  });
}
