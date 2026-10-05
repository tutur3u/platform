import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test('an acknowledged money edit survives a failed detail refresh', () async {
    final api = _Api();
    final repository = FinanceRepository(apiClient: api);
    const path = '/api/workspaces/ws/transactions/tx';
    when(() => api.putJson(path, any())).thenAnswer((_) async => const {});
    when(
      () => api.getJson(path),
    ).thenThrow(const ApiException.transport(message: 'Offline after save'));

    final transaction = await repository.updateTransaction(
      wsId: 'ws',
      transactionId: 'tx',
      amount: 42,
      description: 'Receipt',
      walletId: 'wallet',
    );

    expect(transaction.id, 'tx');
    expect(transaction.amount, 42);
    verify(() => api.putJson(path, any())).called(1);
    verify(() => api.getJson(path)).called(1);
  });
}
