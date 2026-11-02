import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';
import 'package:mobile/features/mail/data/mail_offline_preparation.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final master in [false, true]) {
    for (final enabled in [false, true]) {
      test('registration master=$master chat=$enabled', () async {
        final registry = OfflinePreparerRegistry(
          isEnabled: (flag) =>
              flag == MobileFlag.mobileOffline ? master : enabled,
        );
        var calls = 0;
        MailOfflinePreparation.register(registry, (_) async {
          calls++;
        });
        expect(registry.containsKey('mail'), master && enabled);
        await registry['mail']?.call('ws');
        expect(calls, master && enabled ? 1 : 0);
        final coordinator = OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
          registry: registry,
        );
        await coordinator.run(userId: 'user', workspaceId: 'ws');
        expect(
          coordinator.state.value.products['mail']?.lastSuccess != null,
          master && enabled,
        );
        coordinator.state.dispose();
      });
    }
  }
  test('disabling removes a previous registration', () {
    var enabled = true;
    final registry = OfflinePreparerRegistry(isEnabled: (_) => enabled);
    MailOfflinePreparation.register(registry, (_) async {});
    enabled = false;
    MailOfflinePreparation.register(registry, (_) async {});
    expect(registry.appKeys, isEmpty);
  });

  late Directory directory;
  late CacheStore store;
  late _Api api;
  var owner = 'user';
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('drive-offline-');
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
    when(() => api.getJson(any())).thenAnswer(
      (call) async =>
          (call.positionalArguments.first as String).endsWith('/bootstrap')
          ? {
              'mailboxes': [
                {'id': 'box'},
              ],
            }
          : {
              'threads': [
                {'id': 'thread'},
              ],
            },
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => MailOfflinePreparation(
    api: api,
    store: store,
    currentUser: () => owner,
  ).prepare('ws');
  const base = '/api/v1/workspaces/ws/mail';
  test('preparer keys equal Mail screen cache keys', () async {
    await prepare();
    final cache = MailCache(store: store, currentUserId: () => owner);
    verify(() => api.getJson(any())).called(2);
    when(() => api.getJson(any())).thenThrow(
      const ApiException(
        message: 'offline',
        statusCode: 0,
        failureKind: ApiFailureKind.transport,
      ),
    );
    final repository = MailRepository(
      apiClient: api,
      cache: cache,
      currentUserId: () => owner,
    );
    expect(await repository.bootstrap('ws'), contains('mailboxes'));
    expect(
      await repository.list('ws', 'box', folder: 'inbox'),
      contains('threads'),
    );
  });
  for (final bytes in [false, true]) {
    test('over ${bytes ? "bytes" : "items"} cap publishes nothing', () async {
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'mailboxes': bytes
              ? <dynamic>[]
              : List.generate(201, (i) => {'id': '$i'}),
          if (bytes) 'padding': 'x' * (MailOfflinePreparation.maxBytes + 1),
        },
      );
      await expectLater(
        prepare(),
        throwsA(isA<OfflinePreparationUnavailable>()),
      );
      expect(
        store
            .peek<Map<String, dynamic>>(
              key: CacheKey(
                namespace: 'mail.list',
                userId: owner,
                workspaceId: 'ws',
                params: {'path': Uri.encodeComponent('$base/bootstrap')},
              ),
              decode: (value) => Map<String, dynamic>.from(value! as Map),
            )
            .hasValue,
        isFalse,
      );
    });
  }
}
