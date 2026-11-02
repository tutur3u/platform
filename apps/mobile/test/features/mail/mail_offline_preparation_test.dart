import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
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
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

class _Api extends Mock implements ApiClient {}

class _ColdRepository extends MailRepository {
  _ColdRepository({
    required super.apiClient,
    required super.cache,
    required super.currentUserId,
  });
  @override
  Future<void> saveView(String wsId, Map<String, dynamic> view) async {}
}

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
  Future<void> Function(String)? checkpoint;
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
    checkpoint = null;
    store = CacheStore.forTesting(
      secureStorage: storage,
      persistenceCheckpoint: (stage) async {
        if (checkpoint != null) await checkpoint!(stage);
      },
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
                {
                  'id': 'box',
                  'address': 'fixture@example.test',
                  'status': 'active',
                },
              ],
            }
          : {
              'pagination': {'hasMore': false, 'total': 1},
              'threads': [
                {
                  'id': 'thread',
                  'subject': 'Prepared subject',
                  'fromAddress': 'sender@example.test',
                },
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
  testWidgets('prepared Mail opens the real cold inbox offline', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.runAsync(prepare);
    when(() => api.getJson(any())).thenThrow(
      const ApiException(
        message: 'offline',
        statusCode: 0,
        failureKind: ApiFailureKind.transport,
      ),
    );
    final repository = _ColdRepository(
      apiClient: api,
      cache: MailCache(store: store, currentUserId: () => owner),
      currentUserId: () => owner,
    );
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Prepared subject'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  final inboxQuery = Uri(
    queryParameters: {
      'folder': 'inbox',
      'query': '',
      'page': '1',
      'pageSize': '30',
    },
  ).query;
  final inboxPath =
      '${MailRepository.mailboxPath('ws', 'box')}/threads?$inboxQuery';
  MailRepository reader() => MailRepository(
    apiClient: api,
    cache: MailCache(store: store, currentUserId: () => owner),
    currentUserId: () => owner,
  );
  void blockNetwork() => when(() => api.getJson(any())).thenThrow(
    const ApiException(
      message: 'offline',
      statusCode: 0,
      failureKind: ApiFailureKind.transport,
    ),
  );
  Future<void> assertColdDenied() async {
    blockNetwork();
    final cold = reader();
    await expectLater(cold.bootstrap('ws'), throwsA(anything));
    await expectLater(
      cold.list('ws', 'box', folder: 'inbox'),
      throwsA(anything),
    );
  }

  for (final path in ['$base/bootstrap', inboxPath]) {
    test('Mail preparation fresh 403 purges cold data: $path', () async {
      await prepare();
      when(
        () => api.getJson(path),
      ).thenThrow(const ApiException(message: 'Denied', statusCode: 403));
      await expectLater(prepare(), throwsA(isA<ApiException>()));
      await assertColdDenied();
    });
  }
  test('Mail preparation MFA denial preserves authorized cold data', () async {
    await prepare();
    when(() => api.getJson('$base/bootstrap')).thenThrow(
      const ApiException(
        message: 'Verify',
        statusCode: 403,
        code: 'MFA_REQUIRED',
      ),
    );
    await expectLater(prepare(), throwsA(isA<ApiException>()));
    blockNetwork();
    expect(await reader().bootstrap('ws'), contains('mailboxes'));
    expect(
      await reader().list('ws', 'box', folder: 'inbox'),
      contains('threads'),
    );
  });
  test(
    'Mail held response after reader denial cannot resurrect or become ready',
    () async {
      await prepare();
      final entered = Completer<void>();
      final held = Completer<Map<String, dynamic>>();
      when(() => api.getJson('$base/bootstrap')).thenAnswer((_) {
        entered.complete();
        return held.future;
      });
      final registry = OfflinePreparerRegistry(isEnabled: (_) => true);
      MailOfflinePreparation.register(registry, (_) => prepare());
      final coordinator = OfflinePreparationCoordinator.forTesting(
        load: (_, _) async => {},
        write: (_, _, _) async {},
        registry: registry,
      );
      addTearDown(coordinator.state.dispose);
      final running = coordinator.run(
        userId: owner,
        workspaceId: 'ws',
        productId: 'mail',
      );
      await entered.future;
      when(
        () => api.getJson('$base/bootstrap'),
      ).thenThrow(const ApiException(message: 'Denied', statusCode: 403));
      await expectLater(
        CacheStore.awaitRevalidation(() => reader().bootstrap('ws')),
        throwsA(isA<ApiException>()),
      );
      held.complete({
        'mailboxes': [
          {'id': 'box'},
        ],
      });
      await running;
      expect(
        coordinator.state.value.products['mail']?.status,
        isNot(OfflinePreparationStatus.ready),
      );
      expect(coordinator.state.value.products['mail']?.lastSuccess, isNull);
      await assertColdDenied();
    },
  );
  test('Mail purge during durable publication prevents readiness', () async {
    var purged = false;
    Future<void>? purge;
    checkpoint = (stage) async {
      if (stage == 'snapshot' && !purged) {
        purged = true;
        purge = MailCache(
          store: store,
          currentUserId: () => owner,
        ).denyAccess('ws');
      }
    };
    final registry = OfflinePreparerRegistry(isEnabled: (_) => true);
    MailOfflinePreparation.register(registry, (_) => prepare());
    final coordinator = OfflinePreparationCoordinator.forTesting(
      load: (_, _) async => {},
      write: (_, _, _) async {},
      registry: registry,
    );
    addTearDown(coordinator.state.dispose);
    await coordinator.run(userId: owner, workspaceId: 'ws', productId: 'mail');
    await purge;
    checkpoint = null;
    expect(purged, isTrue);
    expect(
      coordinator.state.value.products['mail']?.status,
      isNot(OfflinePreparationStatus.ready),
    );
    expect(coordinator.state.value.products['mail']?.lastSuccess, isNull);
    await assertColdDenied();
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
