import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/data/repositories/time_tracker_threshold_cache.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _Api api;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('threshold-cache-');
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
    api = _Api();
    when(() => api.checkUser(any())).thenReturn(null);
    // Offline: every network read fails.
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException(message: 'offline', statusCode: 0));
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  Future<Map<String, dynamic>> readBack(String path) => readThroughJson(
    api: api,
    namespace: 'time_tracker.data',
    workspaceId: 'ws',
    path: path,
    cacheStore: store,
    cacheUserId: () => 'owner',
  );

  test('a queued threshold save is what offline reloads read back', () async {
    final settingsPath = timerWorkspaceSettingsPath('ws');
    await store.write(
      key: const CacheKey(
        namespace: 'time_tracker.data',
        userId: 'owner',
        workspaceId: 'ws',
        params: {'path': '/api/v1/workspaces/ws/settings'},
      ),
      policy: CachePolicies.moduleData,
      payload: {'missed_entry_date_threshold': 3, 'timezone': 'Asia/Saigon'},
    );

    await cacheSavedMissedEntryThreshold(
      userId: 'owner',
      workspaceId: 'ws',
      threshold: 7,
      statusChangeGracePeriodMinutes: 15,
      cacheStore: store,
    );

    final settings = await readBack(settingsPath);
    expect(settings['missed_entry_date_threshold'], 7);
    // Unrelated workspace settings survive the merge.
    expect(settings['timezone'], 'Asia/Saigon');
    expect((await readBack(timerGracePeriodConfigPath('ws')))['value'], '15');

    // "No approval needed" is a real saved value, not a missing one.
    await cacheSavedMissedEntryThreshold(
      userId: 'owner',
      workspaceId: 'ws',
      threshold: null,
      statusChangeGracePeriodMinutes: 0,
      cacheStore: store,
    );
    final cleared = await readBack(settingsPath);
    expect(cleared.containsKey('missed_entry_date_threshold'), isTrue);
    expect(cleared['missed_entry_date_threshold'], isNull);
  });
}
