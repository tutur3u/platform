import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  group('FinanceRepository', () {
    late _MockApiClient apiClient;
    late FinanceRepository repository;

    setUp(() {
      apiClient = _MockApiClient();
      repository = FinanceRepository(apiClient: apiClient);
    });

    test('getWallets maps list response', () async {
      when(
        () => apiClient.getJsonList('/api/workspaces/ws_1/wallets'),
      ).thenAnswer(
        (_) async => [
          {
            'id': 'wallet_1',
            'name': 'Cash',
            'currency': 'USD',
          },
        ],
      );

      final wallets = await repository.getWallets('ws_1');

      expect(wallets, hasLength(1));
      expect(wallets.first.id, 'wallet_1');
      expect(wallets.first.name, 'Cash');
      verify(
        () => apiClient.getJsonList('/api/workspaces/ws_1/wallets'),
      ).called(1);
    });

    test('createWallet posts payload to wallets endpoint', () async {
      when(
        () => apiClient.postJson(any(), any()),
      ).thenAnswer((_) async => {'message': 'success'});

      await repository.createWallet(
        wsId: 'ws_1',
        name: 'Main wallet',
        description: 'Everyday spending',
        type: 'CREDIT',
        currency: 'USD',
        icon: 'Wallet',
        limit: 1000,
        statementDate: 10,
        paymentDate: 20,
      );

      verify(
        () => apiClient.postJson('/api/workspaces/ws_1/wallets', {
          'name': 'Main wallet',
          'description': 'Everyday spending',
          'type': 'CREDIT',
          'currency': 'USD',
          'icon': 'Wallet',
          'image_src': null,
          'limit': 1000,
          'statement_date': 10,
          'payment_date': 20,
        }),
      ).called(1);
    });

    test('updateWallet puts payload to wallet endpoint', () async {
      when(
        () => apiClient.putJson(any(), any()),
      ).thenAnswer((_) async => {'message': 'success'});

      await repository.updateWallet(
        wsId: 'ws_1',
        walletId: 'wallet_1',
        name: 'Savings',
        description: 'Long term',
        type: 'STANDARD',
        currency: 'VND',
        imageSrc: 'bank/vietcombank',
      );

      verify(
        () => apiClient.putJson('/api/workspaces/ws_1/wallets/wallet_1', {
          'name': 'Savings',
          'description': 'Long term',
          'type': 'STANDARD',
          'currency': 'VND',
          'icon': null,
          'image_src': 'bank/vietcombank',
          'limit': null,
          'statement_date': null,
          'payment_date': null,
        }),
      ).called(1);
    });

    test('deleteWallet calls wallet delete endpoint', () async {
      when(
        () => apiClient.deleteJson(any()),
      ).thenAnswer((_) async => {'message': 'success'});

      await repository.deleteWallet(wsId: 'ws_1', walletId: 'wallet_1');

      verify(
        () => apiClient.deleteJson('/api/workspaces/ws_1/wallets/wallet_1'),
      ).called(1);
    });

    test('getCategories maps list response', () async {
      when(
        () => apiClient.getJsonList(
          '/api/workspaces/ws_1/transactions/categories',
        ),
      ).thenAnswer(
        (_) async => [
          {
            'id': 'cat_1',
            'name': 'Food',
            'is_expense': true,
            'ws_id': 'ws_1',
            'icon': 'Utensils',
            'color': '#ff0000',
            'amount': 120.5,
            'transaction_count': 3,
          },
        ],
      );

      final categories = await repository.getCategories('ws_1');

      expect(categories, hasLength(1));
      expect(categories.first.id, 'cat_1');
      expect(categories.first.name, 'Food');
      expect(categories.first.icon, 'Utensils');
      expect(categories.first.color, '#ff0000');
      expect(categories.first.amount, 120.5);
      expect(categories.first.transactionCount, 3);
      verify(
        () => apiClient.getJsonList(
          '/api/workspaces/ws_1/transactions/categories',
        ),
      ).called(1);
    });

    test('createCategory posts payload to categories endpoint', () async {
      when(
        () => apiClient.postJson(any(), any()),
      ).thenAnswer((_) async => {'message': 'success'});

      await repository.createCategory(
        wsId: 'ws_1',
        name: 'Salary',
        isExpense: false,
        icon: 'Briefcase',
      );

      verify(
        () =>
            apiClient.postJson('/api/workspaces/ws_1/transactions/categories', {
              'name': 'Salary',
              'is_expense': false,
              'icon': 'Briefcase',
              'color': null,
            }),
      ).called(1);
    });

    test('updateCategory puts payload to category endpoint', () async {
      when(
        () => apiClient.putJson(any(), any()),
      ).thenAnswer((_) async => {'message': 'success'});

      await repository.updateCategory(
        wsId: 'ws_1',
        categoryId: 'cat_1',
        name: 'Bills',
        isExpense: true,
        icon: 'Receipt',
        color: '#00ff00',
      );

      verify(
        () => apiClient.putJson(
          '/api/workspaces/ws_1/transactions/categories/cat_1',
          {
            'name': 'Bills',
            'is_expense': true,
            'icon': 'Receipt',
            'color': '#00ff00',
          },
        ),
      ).called(1);
    });

    test('deleteCategory calls category delete endpoint', () async {
      when(
        () => apiClient.deleteJson(any()),
      ).thenAnswer((_) async => {'message': 'success'});

      await repository.deleteCategory(wsId: 'ws_1', categoryId: 'cat_1');

      verify(
        () => apiClient.deleteJson(
          '/api/workspaces/ws_1/transactions/categories/cat_1',
        ),
      ).called(1);
    });

    test(
      'updateTransaction sends advanced payload and refetches transaction',
      () async {
        Map<String, dynamic>? sentBody;

        when(
          () => apiClient.putJson(any(), any()),
        ).thenAnswer((invocation) async {
          sentBody = invocation.positionalArguments[1] as Map<String, dynamic>;
          return {'message': 'success'};
        });

        when(
          () => apiClient.getJson('/api/workspaces/ws_1/transactions/tx_1'),
        ).thenAnswer(
          (_) async => {
            'id': 'tx_1',
            'amount': -120.5,
            'description': 'Dinner',
            'wallet_id': 'wallet_1',
            'category_id': 'cat_1',
            'wallet_name': 'Cash',
            'wallet_currency': 'USD',
            'category_name': 'Food',
            'report_opt_in': false,
            'is_amount_confidential': true,
            'is_description_confidential': false,
            'is_category_confidential': true,
          },
        );

        final transaction = await repository.updateTransaction(
          wsId: 'ws_1',
          transactionId: 'tx_1',
          amount: -120.5,
          description: 'Dinner',
          walletId: 'wallet_1',
          categoryId: 'cat_1',
          reportOptIn: false,
          isAmountConfidential: true,
          isDescriptionConfidential: false,
          isCategoryConfidential: true,
        );

        expect(sentBody, isNotNull);
        expect(sentBody!['amount'], -120.5);
        expect(sentBody!['origin_wallet_id'], 'wallet_1');
        expect(sentBody!['category_id'], 'cat_1');
        expect(sentBody!['report_opt_in'], false);
        expect(sentBody!['is_amount_confidential'], true);
        expect(sentBody!['is_description_confidential'], false);
        expect(sentBody!['is_category_confidential'], true);

        expect(transaction.id, 'tx_1');
        expect(transaction.walletName, 'Cash');
        expect(transaction.categoryName, 'Food');
        expect(transaction.reportOptIn, false);
        expect(transaction.isAmountConfidential, true);
        expect(transaction.isCategoryConfidential, true);

        verify(
          () => apiClient.putJson(
            '/api/workspaces/ws_1/transactions/tx_1',
            any(),
          ),
        ).called(1);
        verify(
          () => apiClient.getJson('/api/workspaces/ws_1/transactions/tx_1'),
        ).called(1);
      },
    );

    test('deleteTransaction calls workspace transaction endpoint', () async {
      when(
        () => apiClient.deleteJson('/api/workspaces/ws_1/transactions/tx_1'),
      ).thenAnswer((_) async => {'message': 'success'});

      await repository.deleteTransaction(wsId: 'ws_1', transactionId: 'tx_1');

      verify(
        () => apiClient.deleteJson('/api/workspaces/ws_1/transactions/tx_1'),
      ).called(1);
    });
  });
}
