import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test(
    'transaction CSV pages through the current filters and escapes text',
    () async {
      final api = _Api();
      final requests = <Uri>[];
      when(() => api.getJson(any())).thenAnswer((call) async {
        final uri = Uri.parse(call.positionalArguments.first as String);
        requests.add(uri);
        final firstPage = uri.queryParameters['page'] == '1';
        return {
          'count': 501,
          'data': [
            if (firstPage)
              for (var index = 0; index < 500; index++)
                {'amount': -34.5, 'description': ' =1+1'}
            else
              {'amount': 42, 'description': 'Rent, "November"'},
          ],
        };
      });
      final repository = FinanceRepository(
        apiClient: api,
        cacheUserId: () => null,
      );
      final csv = await repository.exportFinanceTransactions(
        workspace: 'ws',
        filters: const FinanceTransactionQuery(
          kind: FinanceTransactionKind.expense,
          categoryId: 'rent',
          tagId: 'recurring',
        ),
        search: ' november ',
        walletId: 'cash',
        shouldContinue: () => true,
      );
      expect(
        requests.map((uri) => uri.path),
        everyElement('/api/workspaces/ws/transactions/export'),
      );
      expect(requests.map((uri) => uri.queryParameters['page']), ['1', '2']);
      for (final uri in requests) {
        expect(uri.queryParameters, containsPair('walletIds', 'cash'));
        expect(uri.queryParameters, containsPair('categoryIds', 'rent'));
        expect(uri.queryParameters, containsPair('tagIds', 'recurring'));
        expect(uri.queryParameters, containsPair('transactionType', 'expense'));
        expect(uri.queryParameters, containsPair('q', 'november'));
      }
      expect(csv, contains('"-34.5"'));
      expect(csv, contains('''"' =1+1"'''));
      expect(csv, contains('"Rent, ""November"""'));
    },
  );

  test('a cancelled export performs no reads', () async {
    final api = _Api();
    final repository = FinanceRepository(
      apiClient: api,
      cacheUserId: () => null,
    );
    final csv = await repository.exportFinanceTransactions(
      workspace: 'ws',
      filters: const FinanceTransactionQuery(),
      search: '',
      walletId: null,
      shouldContinue: () => false,
    );
    expect(csv, isNull);
    verifyNever(() => api.getJson(any()));
  });
}
