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
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    await store.init();
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
          'entries': <dynamic>[],
        },
      );
    }
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => HabitsOfflinePreparation(
    api: api,
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
      expect(detail.entries, isEmpty);
      await Future<void>.delayed(Duration.zero);
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
