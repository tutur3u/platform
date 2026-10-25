import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class SettingsApi extends ApiClient {
  final gets = <String>[];
  final patches = <(String, Map<String, dynamic>)>[];
  Future<Map<String, dynamic>> Function(String) read = (_) async => {
    'timezone': 'auto',
    'first_day_of_week': 'auto',
  };
  Future<Map<String, dynamic>> Function(String, Map<String, dynamic>) write =
      (_, body) async => body;

  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) {
    gets.add(path);
    return read(path);
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) {
    patches.add((path, body));
    return write(path, body);
  }
}

class CalendarSettingsCacheHarness {
  final api = SettingsApi();
  final _storage = _Storage();
  late Directory _directory;
  late CacheStore store;
  String? actor = 'actor';
  bool failRemoval = false;
  String? currentActor() => actor;

  CacheStore _createStore() => CacheStore.forTesting(
    secureStorage: _storage,
    directoryResolver: () async => _directory,
    persistenceCheckpoint: (stage) {
      if (failRemoval && stage == 'remove-snapshot') {
        throw StateError('Synthetic purge storage failure');
      }
    },
  );

  Future<void> init() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    _directory = await Directory.systemTemp.createTemp('calendar-settings-');
    final secrets = <String, String>{};
    when(
      () => _storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => _storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = _createStore();
    await store.init();
  }

  Future<void> seed(
    String namespace,
    String value, {
    String userId = 'actor',
    String? workspaceId,
    CachePolicy policy = CachePolicies.metadata,
  }) => store.write(
    key: CacheKey(
      namespace: namespace,
      userId: userId,
      workspaceId: workspaceId,
    ),
    policy: policy,
    payload: {'value': value},
    tags: const ['module:settings'],
  );

  Future<void> reopen() async {
    await store.closeForTesting();
    store = _createStore();
    await store.init();
  }

  Future<void> dispose() async {
    api.dispose();
    await store.closeForTesting();
    await Hive.close();
    await _directory.delete(recursive: true);
  }
}
