import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    await CacheStore.instance.clearScope();
    OfflineMutationQueue.instance.pending.value = [];
  });
  test('shows queued checkpoints during an offline refresh', () async {
    final apiClient = _MockApiClient();
    final repository = FinanceRepository(apiClient: apiClient);
    when(
      () => apiClient.getJson(any()),
    ).thenThrow(const ApiException(message: 'Offline', statusCode: 0));
    OfflineMutationQueue.instance.pending.value = [
      PendingMutationRecord(
        id: 'checkpoint-edit',
        feature: 'finance',
        method: 'POST',
        path: FinanceEndpoints.walletCheckpoints('ws-offline', 'wallet-1'),
        createdAt: DateTime.utc(2026, 9, 29),
        userId: 'user-1',
        workspaceId: 'ws-offline',
        payload: const {
          'actual_balance': 150,
          'checked_at': '2026-09-29T00:00:00Z',
          'note': 'Counted in person',
        },
        optimisticPatch: const {'entityId': 'local-checkpoint'},
      ),
    ];

    final response = await repository.getWalletCheckpoints(
      wsId: 'ws-offline',
      walletId: 'wallet-1',
    );
    expect(response.data.single.actualBalance, 150);
    expect(response.latest, isNull);
    OfflineMutationQueue.instance.pending.value = [];
  });
}
