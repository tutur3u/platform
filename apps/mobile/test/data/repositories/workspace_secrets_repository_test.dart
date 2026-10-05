import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/workspace_secrets_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('WorkspaceSecretsRepository', () {
    late _MockApiClient apiClient;
    late WorkspaceSecretsRepository repository;

    setUp(() async {
      apiClient = _MockApiClient();
      repository = WorkspaceSecretsRepository(apiClient: apiClient);
    });

    test(
      'returns remote secrets without creating a readable cache entry',
      () async {
        when(
          () => apiClient.getJsonList('/api/workspaces/ws_1/secrets'),
        ).thenAnswer(
          (_) async => [
            {
              'id': 'secret_1',
              'ws_id': 'ws_1',
              'name': 'DRIVE_R2_SECRET_ACCESS_KEY',
              'value': 'plain-text-secret',
              'created_at': '2026-06-03T01:00:00.000Z',
            },
          ],
        );

        final first = await repository.getSecrets('ws_1');
        final second = await repository.getSecrets('ws_1');
        final cached = await repository.readCachedSecrets('ws_1');

        expect(first.single.value, 'plain-text-secret');
        expect(second.single.value, 'plain-text-secret');
        expect(cached.hasValue, isFalse);
        expect(cached.data, isNull);
        verify(
          () => apiClient.getJsonList('/api/workspaces/ws_1/secrets'),
        ).called(2);
      },
    );

    for (final kind in [
      ApiFailureKind.response,
      ApiFailureKind.session,
      ApiFailureKind.unknown,
    ]) {
      test('pending secrets reject nontransport status zero: $kind', () async {
        when(() => apiClient.getJsonList(any())).thenThrow(
          ApiException(message: 'Synthetic', statusCode: 0, failureKind: kind),
        );
        OfflineMutationQueue.instance.pending.value = [
          PendingMutationRecord(
            id: 'secret-edit',
            feature: 'settings',
            method: 'WORKSPACE_SECRET_CREATE',
            path: WorkspaceSettingsEndpoints.secrets('typed-ws'),
            userId: 'actor',
            workspaceId: 'typed-ws',
            createdAt: DateTime.utc(2026),
            payload: const {'name': 'KEY', 'value': 'synthetic'},
            optimisticPatch: const {'entityId': 'local-secret'},
          ),
        ];
        try {
          await expectLater(
            repository.getSecrets('typed-ws', forceRefresh: true),
            throwsA(
              isA<ApiException>().having((e) => e.failureKind, 'kind', kind),
            ),
          );
        } finally {
          OfflineMutationQueue.instance.pending.value = [];
        }
      });
    }

    test('shows a queued secret only in its workspace', () async {
      when(
        () => apiClient.getJsonList(any()),
      ).thenThrow(const ApiException.transport(message: 'Offline'));
      OfflineMutationQueue.instance.pending.value = [
        PendingMutationRecord(
          id: 'secret-edit',
          feature: 'settings',
          method: 'WORKSPACE_SECRET_CREATE',
          path: WorkspaceSettingsEndpoints.secrets('ws-offline'),
          createdAt: DateTime.utc(2026, 9, 29),
          userId: 'user-1',
          workspaceId: 'ws-offline',
          payload: const {'name': 'API_KEY', 'value': 'test-value'},
          optimisticPatch: const {'entityId': 'local-secret'},
        ),
      ];
      final secrets = await repository.getSecrets('ws-offline');
      expect(secrets.single.name, 'API_KEY');
      expect(await repository.getSecrets('ws-other'), isEmpty);
      OfflineMutationQueue.instance.pending.value = [];
    });
  });
}
