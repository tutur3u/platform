import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mocktail/mocktail.dart';

class _MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory tempDir;
  late FlutterSecureStorage secureStorage;
  late Map<String, String> secureStorageValues;
  late CacheStore cacheStore;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp(
      'tuturuuu-cache-encryption-test-',
    );
    secureStorage = _MockFlutterSecureStorage();
    secureStorageValues = <String, String>{};

    when(() => secureStorage.read(key: any(named: 'key'))).thenAnswer(
      (invocation) async =>
          secureStorageValues[invocation.namedArguments[#key] as String],
    );
    when(
      () => secureStorage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((invocation) async {
      final key = invocation.namedArguments[#key] as String;
      final value = invocation.namedArguments[#value] as String?;
      if (value == null) {
        secureStorageValues.remove(key);
      } else {
        secureStorageValues[key] = value;
      }
    });

    cacheStore = CacheStore.forTesting(
      secureStorage: secureStorage,
      directoryResolver: () async => tempDir,
    );
  });

  tearDown(() async {
    await cacheStore.closeForTesting();
    await Hive.close();
    if (tempDir.existsSync()) {
      tempDir.deleteSync(recursive: true);
    }
  });

  test('encrypts cached resources and pending mutations at rest', () async {
    const resourceSecret = 'finance-wallet-secret-amount-123456789';
    const mutationSecret = 'pending-mutation-secret-description-987654321';

    await cacheStore.write(
      key: const CacheKey(
        namespace: 'finance.transactions',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      ),
      policy: CachePolicies.detail,
      payload: const <String, Object?>{'description': resourceSecret},
    );
    await cacheStore.savePendingMutation(
      PendingMutationRecord(
        id: 'mutation-1',
        feature: 'finance',
        method: 'POST',
        path: '/api/v1/workspaces/workspace-1/finance',
        createdAt: DateTime.utc(2026),
        workspaceId: 'workspace-1',
        userId: 'user-1',
        payload: const <String, dynamic>{'description': mutationSecret},
      ),
    );

    final cached = await cacheStore.read<Map<String, dynamic>>(
      key: const CacheKey(
        namespace: 'finance.transactions',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      ),
      decode: (json) => Map<String, dynamic>.from(json! as Map),
    );
    final pendingMutations = await cacheStore.listPendingMutations();

    expect(cached.data?['description'], resourceSecret);
    expect(pendingMutations.single.payload?['description'], mutationSecret);
    expect(secureStorageValues, isNotEmpty);

    await cacheStore.closeForTesting();
    await Hive.close();

    final reopenedStore = CacheStore.forTesting(
      secureStorage: secureStorage,
      directoryResolver: () async => tempDir,
    );
    addTearDown(reopenedStore.closeForTesting);

    final reopenedCached = await reopenedStore.read<Map<String, dynamic>>(
      key: const CacheKey(
        namespace: 'finance.transactions',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      ),
      decode: (json) => Map<String, dynamic>.from(json! as Map),
    );
    final reopenedPendingMutations = await reopenedStore.listPendingMutations();

    expect(reopenedCached.data?['description'], resourceSecret);
    expect(
      reopenedPendingMutations.single.payload?['description'],
      mutationSecret,
    );

    await reopenedStore.closeForTesting();
    await Hive.close();

    final diskBytes = <int>[];
    await for (final entity in tempDir.list(recursive: true)) {
      if (entity is File) {
        diskBytes.addAll(await entity.readAsBytes());
      }
    }

    final diskText = utf8.decode(diskBytes, allowMalformed: true);
    expect(diskText, isNot(contains(resourceSecret)));
    expect(diskText, isNot(contains(mutationSecret)));
  });
}
