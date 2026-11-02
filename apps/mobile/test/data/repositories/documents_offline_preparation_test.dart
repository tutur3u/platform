import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/repositories/documents_offline_preparation.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final master in [false, true]) {
    for (final enabled in [false, true]) {
      test('registration master=$master documents=$enabled', () async {
        final registry = OfflinePreparerRegistry(
          isEnabled: (flag) =>
              flag == MobileFlag.mobileOffline ? master : enabled,
        );
        var calls = 0;
        DocumentsOfflinePreparation.register(registry, (_) async {
          calls++;
        });
        expect(registry.containsKey('documents'), master && enabled);
        await registry['documents']?.call('ws');
        expect(calls, master && enabled ? 1 : 0);
        final coordinator = OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
          registry: registry,
        );
        await coordinator.run(userId: 'user', workspaceId: 'ws');
        expect(
          coordinator.state.value.products['documents']?.lastSuccess != null,
          master && enabled,
        );
        coordinator.state.dispose();
      });
    }
  }
  test('disabling removes a previous registration', () {
    var enabled = true;
    final registry = OfflinePreparerRegistry(isEnabled: (_) => enabled);
    DocumentsOfflinePreparation.register(registry, (_) async {});
    enabled = false;
    DocumentsOfflinePreparation.register(registry, (_) async {});
    expect(registry.appKeys, isEmpty);
  });

  late Directory directory;
  late CacheStore store;
  late _Api api;
  var owner = 'user';
  const listPath = '/api/v1/workspaces/ws/documents?limit=30&offset=0';
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('documents-offline-');
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
        'data': [
          {'id': 'd1', 'name': 'Document', 'content': 'private body'},
        ],
      },
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => DocumentsOfflinePreparation(
    api: api,
    store: store,
    currentUser: () => owner,
  ).prepare('ws');

  test(
    'prepared metadata is read by the exact default list key offline',
    () async {
      expect(DocumentsOfflinePreparation.path('ws'), listPath);
      await prepare();
      verify(() => api.getJson(any())).called(1);
      when(
        () => api.getJson(any()),
      ).thenThrow(const SocketException('offline'));
      final result = await readThroughJson(
        api: api,
        namespace: 'documents.list',
        workspaceId: 'ws',
        path: listPath,
        cacheStore: store,
        cacheUserId: () => owner,
      );
      final row = (result['data'] as List).single as Map;
      expect(row['id'], 'd1');
      expect(row.containsKey('content'), isFalse);
      await Future<void>.delayed(Duration.zero);
    },
  );
  test('item cap rejects before publishing', () async {
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'data': List.generate(201, (i) => {'id': '$i'}),
      },
    );
    await expectLater(prepare(), throwsA(isA<OfflinePreparationUnavailable>()));
  });
  test('oversized response fails preparation', () async {
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'data': <dynamic>[],
        'padding': 'x' * (DocumentsOfflinePreparation.maxBytes + 1),
      },
    );
    await expectLater(prepare(), throwsA(isA<OfflinePreparationUnavailable>()));
  });
  test('account switch during response prevents publication', () async {
    when(() => api.getJson(listPath)).thenAnswer((_) async {
      owner = 'other';
      return {'data': <dynamic>[]};
    });
    await expectLater(prepare(), throwsStateError);
  });
}
