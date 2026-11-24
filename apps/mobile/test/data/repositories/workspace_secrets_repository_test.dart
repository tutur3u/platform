import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/workspace_secrets_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

class _SecureStorage extends Mock implements FlutterSecureStorage {}

List<Map<String, dynamic>> _rows() => [
  {
    'id': 'secret_1',
    'ws_id': 'ws_1',
    'name': 'DRIVE_R2_SECRET_ACCESS_KEY',
    'value': null,
    'created_at': '2026-06-03T01:00:00.000Z',
    'tier': 'credential',
    'value_set': true,
    'value_masked': true,
  },
  {
    'id': 'secret_2',
    'ws_id': 'ws_1',
    'name': 'DRIVE_R2_BUCKET',
    'value': 'drive-bucket',
    'created_at': '2026-06-03T01:00:00.000Z',
    'tier': 'config',
    'value_set': true,
    'value_masked': false,
  },
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => registerFallbackValue(<String, dynamic>{}));

  group('WorkspaceSecretsRepository', () {
    late _MockApiClient apiClient;
    late CacheStore store;
    late Directory directory;
    late WorkspaceSecretsRepository repository;

    setUp(() async {
      apiClient = _MockApiClient();
      directory = await Directory.systemTemp.createTemp('workspace-secrets-');
      final storage = _SecureStorage();
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
      repository = WorkspaceSecretsRepository(
        apiClient: apiClient,
        cacheStore: store,
      );
      OfflineMutationQueue.instance.pending.value = [];
      addTearDown(() async {
        OfflineMutationQueue.instance.pending.value = [];
        await store.closeForTesting();
        await Hive.close();
        await directory.delete(recursive: true);
      });
    });

    test('fetches live rows and never persists the list', () async {
      when(
        () => apiClient.getJsonList('/api/workspaces/ws_1/secrets'),
      ).thenAnswer((_) async => _rows());

      final first = await repository.getSecrets('ws_1');
      final second = await repository.getSecrets('ws_1');
      final cached = await repository.readCachedSecrets('ws_1');
      final persisted = await store.read<Object?>(
        key: WorkspaceSecretsRepository.secretsListCacheKey('ws_1'),
        decode: (json) => json,
      );

      expect(first.first.valueMasked, isTrue);
      expect(first.first.value, isNull);
      expect(second.last.value, 'drive-bucket');
      expect(cached.hasValue, isFalse);
      expect(cached.data, isNull);
      expect(persisted.hasValue, isFalse);
      verify(
        () => apiClient.getJsonList('/api/workspaces/ws_1/secrets'),
      ).called(2);
    });

    test('the store refuses to persist a secrets list', () async {
      final listKey = WorkspaceSecretsRepository.secretsListCacheKey('ws_1');
      await store.write(
        key: listKey,
        policy: CachePolicies.metadata,
        payload: [
          {'id': 'old', 'name': 'TOKEN', 'value': 'synthetic-value'},
        ],
      );

      final persisted = await store.read<Object?>(
        key: listKey,
        decode: (json) => json,
      );

      expect(persisted.hasValue, isFalse);
      expect((await repository.readCachedSecrets('ws_1')).hasValue, isFalse);
    });

    test('offline refresh reuses only the in-memory list', () async {
      when(
        () => apiClient.getJsonList(any()),
      ).thenThrow(const ApiException.transport(message: 'Offline'));
      await expectLater(
        repository.getSecrets('ws_1'),
        throwsA(isA<ApiException>()),
      );

      when(() => apiClient.getJsonList(any())).thenAnswer((_) async => _rows());
      await repository.getSecrets('ws_1');
      when(
        () => apiClient.getJsonList(any()),
      ).thenThrow(const ApiException.transport(message: 'Offline'));
      OfflineMutationQueue.instance.pending.value = [
        PendingMutationRecord(
          id: 'secret-delete',
          feature: 'settings',
          method: 'DELETE',
          path: WorkspaceSettingsEndpoints.secret('ws_1', 'secret_2'),
          createdAt: DateTime.utc(2026),
          userId: 'user-1',
          workspaceId: 'ws_1',
          optimisticPatch: const {'entityId': 'secret_2'},
        ),
      ];

      final offline = await repository.getSecrets('ws_1');

      expect(offline.map((secret) => secret.id), ['secret_1']);
      await expectLater(
        WorkspaceSecretsRepository(
          apiClient: apiClient,
          cacheStore: store,
        ).getSecrets('ws_1'),
        throwsA(isA<ApiException>()),
      );
    });

    for (final kind in [
      ApiFailureKind.response,
      ApiFailureKind.session,
      ApiFailureKind.unknown,
    ]) {
      test('rethrows nontransport status zero: $kind', () async {
        when(() => apiClient.getJsonList(any())).thenAnswer((_) async {
          return _rows();
        });
        await repository.getSecrets('typed-ws');
        when(() => apiClient.getJsonList(any())).thenThrow(
          ApiException(message: 'Synthetic', statusCode: 0, failureKind: kind),
        );
        await expectLater(
          repository.getSecrets('typed-ws', forceRefresh: true),
          throwsA(
            isA<ApiException>().having((e) => e.failureKind, 'kind', kind),
          ),
        );
      });
    }

    test('create sends online and never queues the value offline', () async {
      when(
        () => apiClient.postJson(any(), any()),
      ).thenThrow(const ApiException.transport(message: 'Offline'));

      await expectLater(
        repository.createSecret(
          wsId: 'ws_1',
          name: 'API_KEY',
          value: 'synthetic-value',
        ),
        throwsA(isA<ApiException>()),
      );

      verify(
        () => apiClient.postJson('/api/workspaces/ws_1/secrets', {
          'name': 'API_KEY',
          'value': 'synthetic-value',
        }),
      ).called(1);
      expect(OfflineMutationQueue.instance.pending.value, isEmpty);
    });

    test('update sends name and value only, never queued offline', () async {
      when(
        () => apiClient.putJson(any(), any()),
      ).thenThrow(const ApiException.transport(message: 'Offline'));

      await expectLater(
        repository.updateSecret(
          wsId: 'ws_1',
          secretId: 'secret_1',
          name: 'API_KEY',
          value: 'synthetic-value',
        ),
        throwsA(isA<ApiException>()),
      );

      final body =
          verify(
                () => apiClient.putJson(
                  '/api/workspaces/ws_1/secrets/secret_1',
                  captureAny(),
                ),
              ).captured.single
              as Map<String, dynamic>;
      expect(body, {'name': 'API_KEY', 'value': 'synthetic-value'});
      expect(OfflineMutationQueue.instance.pending.value, isEmpty);
    });

    test('keepValue update sends no value and no id', () async {
      when(
        () => apiClient.putJson(any(), any()),
      ).thenAnswer((_) async => <String, dynamic>{});

      await repository.updateSecret(
        wsId: 'ws_1',
        secretId: 'secret_1',
        name: 'RENAMED_KEY',
        value: 'ignored',
        keepValue: true,
      );

      final body =
          verify(
                () => apiClient.putJson(
                  '/api/workspaces/ws_1/secrets/secret_1',
                  captureAny(),
                ),
              ).captured.single
              as Map<String, dynamic>;
      expect(body, {'name': 'RENAMED_KEY', 'keepValue': true});
    });
  });
}
