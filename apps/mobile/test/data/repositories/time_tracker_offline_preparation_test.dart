import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/repositories/time_tracker_offline_preparation.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

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
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => TimeTrackerOfflinePreparation(
    api: api,
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
