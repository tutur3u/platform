import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/finance_repository.dart';

void registerFinancePermissionRestorationTests({
  required Future<void> Function(String, Object) writeSnapshot,
  required FinanceRepository Function() repository,
  required Map<String, dynamic> Function(String, String, int) transaction,
  required void Function() verifyNoRequests,
}) {
  test(
    'newer authorized list restores denied detail in offline search',
    () async {
      await writeSnapshot('finance.transactionDetail', {
        'data': {
          ...transaction('restored', '[CONFIDENTIAL]', 1),
          'amount': null,
          'category_id': null,
          'is_amount_confidential': true,
          'is_category_confidential': true,
        },
      });
      await writeSnapshot('finance.infiniteTransactions', {
        'data': [
          {
            ...transaction('restored', 'Authorized coffee', 1),
            'amount': 25,
            'category_id': 'category',
            'is_amount_confidential': true,
            'is_category_confidential': true,
          },
        ],
      });
      final result = await repository().getTransactionsInfinite(
        wsId: 'ws',
        search: 'coffee',
      );
      expect(result.data.single.description, 'Authorized coffee');
      expect(result.data.single.amount, 25);
      expect(result.data.single.categoryId, 'category');
      final detail = await repository().getTransactionById(
        wsId: 'ws',
        transactionId: 'restored',
      );
      expect(detail?.description, 'Authorized coffee');
      verifyNoRequests();
    },
  );
  test('newer finance redaction hides old detail offline', () async {
    await writeSnapshot('finance.transactionDetail', {
      'data': transaction('secret', 'Synthetic private detail', 1),
    });
    await writeSnapshot('finance.infiniteTransactions', {
      'data': [transaction('secret', '[CONFIDENTIAL]', 1)],
    });
    final visible = await repository().getTransactionsInfinite(wsId: 'ws');
    expect(visible.data.single.description, '[CONFIDENTIAL]');
    expect(
      (await repository().getTransactionsInfinite(
        wsId: 'ws',
        search: 'private',
      )).data,
      isEmpty,
    );
    verifyNoRequests();
  });
}
