import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _Api api;
  late InventoryRepository repository;
  late bool online;
  String? user;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('offline-audit-');
    final storage = _Storage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => null);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) async {});
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    api = _Api();
    online = true;
    user = 'user';
    repository = InventoryRepository(
      apiClient: api,
      cacheStore: store,
      cacheUserId: () => user,
      networkAvailable: () async => online,
    );
    when(() => api.getJsonList(any())).thenAnswer(
      (_) async => [
        {'id': 'lookup', 'name': 'Cached lookup'},
      ],
    );
    when(() => api.getJson(any())).thenAnswer((call) async {
      final path = call.positionalArguments.first as String;
      final isAudit =
          Uri.parse(path).path ==
          Uri.parse(InventoryEndpoints.auditLogs('ws')).path;
      return {
        'data': isAudit
            ? List.generate(
                45,
                (index) => {
                  'auditRecordId': 'audit-$index',
                  'eventKind': 'create',
                  'entityKind': 'product',
                  'entityId': 'product',
                  'summary': 'Item $index',
                  'occurredAt': DateTime.utc(
                    2026,
                    10,
                    2,
                  ).add(Duration(minutes: index)).toIso8601String(),
                },
              )
            : <Map<String, dynamic>>[],
        'count': isAudit ? 45 : 0,
      };
    });
  });
  tearDown(() async {
    repository.dispose();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  Future<void> download() async {
    await repository.prepareOffline('ws');
    online = false;
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException(message: 'Offline', statusCode: 0));
  }

  test(
    'full pack audit page 100 serves first offline UI pages of 20',
    () async {
      await download();
      final first = await repository.getAuditLogs('ws');
      final second = await repository.getAuditLogs('ws', offset: 20);
      final last = await repository.getAuditLogs('ws', offset: 40);
      expect(first.count, 45);
      expect(first.data.length, 20);
      expect(first.data.first.auditRecordId, 'audit-44');
      expect(second.data.first.auditRecordId, 'audit-24');
      expect(last.data.length, 5);
      expect((await repository.getProductCategories('ws')).single.id, 'lookup');
      expect((await repository.getProductUnits('ws')).single.id, 'lookup');
      expect((await repository.getProductWarehouses('ws')).single.id, 'lookup');
      user = 'other';
      expect((await repository.getAuditLogs('ws')).count, 0);
    },
  );

  for (final verification in [false, true]) {
    test(
      'audit denial never falls back; challenge preserves rows=$verification',
      () async {
        await download();
        online = true;
        final denied = ApiException(
          message: 'Denied',
          statusCode: 403,
          isVerificationRequired: verification,
        );
        when(() => api.getJson(any())).thenThrow(denied);
        await expectLater(
          repository.getAuditLogs('ws', forceRefresh: true),
          throwsA(same(denied)),
        );
        online = false;
        expect(
          (await repository.getAuditLogs('ws')).count,
          verification ? 45 : 0,
        );
      },
    );
  }
}
