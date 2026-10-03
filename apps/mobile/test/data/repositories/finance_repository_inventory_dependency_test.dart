import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _MockApiClient apiClient;
  late FinanceRepository repository;
  late OfflineMutationQueue queue;
  setUp(() async {
    apiClient = _MockApiClient();
    await CacheStore.instance.clearScope();
    queue = OfflineMutationQueue.forTesting(
      store: CacheStore.instance,
      userId: () => 'user',
      checkConnectivity: () async => [ConnectivityResult.wifi],
      connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
      apiFactory: (_) => apiClient,
    );
    repository = FinanceRepository(apiClient: apiClient, mutationQueue: queue);
  });
  tearDown(() async {
    await queue.dispose();
    debugClearFinanceRepositoryWorkspaceCurrencyCache();
  });
  test(
    'createWallet durably persists before sending and acknowledges client ID',
    () async {
      when(() => apiClient.postJson(any(), any())).thenAnswer((call) async {
        final retained = (await queue.listPending()).single;
        final payload = call.positionalArguments[1] as Map;
        expect(retained.entityId, payload['id']);
        expect(retained.payload, payload);
        expect(retained.acknowledgedServerId, isNull);
        return {'id': payload['id']};
      });

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

      final payload =
          verify(
                () => apiClient.postJson(
                  '/api/workspaces/ws_1/wallets',
                  captureAny(),
                ),
              ).captured.single
              as Map<String, dynamic>;
      expect(payload['id'], isA<String>());
      expect(await queue.listPending(), isEmpty);
      expect(
        (await CacheStore.instance.localIdMappingsForScope(
          userId: 'user',
          workspaceId: 'ws_1',
        )).values,
        contains(payload['id']),
      );
      expect(payload..remove('id'), {
        'name': 'Main wallet',
        'description': 'Everyday spending',
        'type': 'CREDIT',
        'currency': 'USD',
        'icon': 'Wallet',
        'image_src': null,
        'limit': 1000,
        'statement_date': 10,
        'payment_date': 20,
      });
    },
  );

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

  test('createCategory posts payload to categories endpoint', () async {
    when(() => apiClient.postJson(any(), any())).thenAnswer(
      (_) async => {
        'contract': 'inventory-offline-create-v1',
        'resource': 'finance_category',
        'data': {'id': '11111111-1111-4111-8111-111111111111'},
      },
    );

    await repository.createCategory(
      wsId: 'ws_1',
      name: 'Salary',
      isExpense: false,
      icon: 'Briefcase',
    );

    final payload =
        verify(
              () => apiClient.postJson(
                '/api/v1/workspaces/ws_1/inventory/offline-mutations',
                captureAny(),
              ),
            ).captured.single
            as Map<String, dynamic>;
    expect(payload['operation_id'], isA<String>());
    expect(payload['kind'], 'finance_category');
    expect(payload['payload'], {
      'name': 'Salary',
      'is_expense': false,
      'icon': 'Briefcase',
      'color': null,
    });
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

  test('updateCategory includes null icon and color when omitted', () async {
    when(
      () => apiClient.putJson(any(), any()),
    ).thenAnswer((_) async => {'message': 'success'});

    await repository.updateCategory(
      wsId: 'ws_1',
      categoryId: 'cat_1',
      name: 'Bills',
      isExpense: true,
    );

    verify(
      () => apiClient.putJson(
        '/api/workspaces/ws_1/transactions/categories/cat_1',
        {'name': 'Bills', 'is_expense': true, 'icon': null, 'color': null},
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
}
