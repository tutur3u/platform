import 'package:flutter_test/flutter_test.dart';
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
  });
}
