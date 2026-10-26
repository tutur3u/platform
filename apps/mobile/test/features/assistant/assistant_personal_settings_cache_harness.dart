import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/data/assistant_soul_receipts.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class PersonalSettingsCacheApi extends ApiClient {
  final gets = <String>[];
  final patches = <(String, Map<String, dynamic>)>[];
  Future<Map<String, dynamic>> Function() soul = () async => {
    'soul': {'name': 'Fresh', 'user_id': 'actor-a', 'tone': 'warm'},
  };
  Future<Map<String, dynamic>> Function(String) memory = (path) async =>
      path.contains('/settings')
      ? {
          'enabled': false,
          'products': <String, dynamic>{'mira': false, 'ai_chat': true},
        }
      : {
          'items': <dynamic>[
            {'id': 'memory-a', 'content': 'Remote preference'},
          ],
        };
  Future<Map<String, dynamic>> Function(Map<String, dynamic>) write =
      (body) async => {'soul': body};

  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) {
    gets.add(path);
    return path == assistantSoulPath ? soul() : memory(path);
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) {
    patches.add((path, body));
    return write(body);
  }
}

class PersonalSettingsCacheHarness {
  final api = PersonalSettingsCacheApi();
  late Directory directory;
  late CacheStore store;
  String? actor = 'actor-a';
  Completer<void>? cacheGate;
  bool failCache = false;
  Future<void> Function(String)? checkpoint;

  Future<void> init({bool initializeStore = true}) async {
    TestWidgetsFlutterBinding.ensureInitialized();
    directory = await Directory.systemTemp.createTemp('personal-settings-');
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
      directoryResolver: () async {
        await cacheGate?.future;
        if (failCache) throw StateError('Synthetic cache unavailable');
        return directory;
      },
      persistenceCheckpoint: (stage) async {
        await checkpoint?.call(stage);
      },
    );
    if (initializeStore) await store.init();
  }

  AssistantPersonalSettingsRepository repository() =>
      AssistantPersonalSettingsRepository(
        ownerId: 'actor-a',
        api: api,
        store: store,
        currentUserId: () => actor,
      );

  Future<void> seed({String name = 'Cached'}) => store.write(
    key: verifiedSoulKey('actor-a'),
    policy: CachePolicies.metadata,
    payload: verifiedSoulPayload(AssistantSoul(name: name), 'actor-a'),
    tags: const ['assistant:metadata', 'module:assistant'],
  );

  Future<AssistantSoul?> cachedSoul() async => (await store.read<AssistantSoul>(
    key: verifiedSoulKey('actor-a'),
    decode: (json) => decodeVerifiedSoul(json, 'actor-a'),
  )).data;

  Future<void> drainCache() => store.invalidateTags(const []);

  Future<void> dispose() async {
    api.dispose();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  }
}
