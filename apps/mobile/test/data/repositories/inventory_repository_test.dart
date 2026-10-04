import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Queue extends Mock implements OfflineMutationQueue {}

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await CacheStore.instance.clearScope();
    OfflineMutationQueue.instance.pending.value = [];
  });

  test(
    'shows queued inventory setup choices only in their workspace',
    () async {
      final apiClient = _MockApiClient();
      final repository = InventoryRepository(
        apiClient: apiClient,
        cacheUserId: () => 'user-1',
      );
      when(
        () => apiClient.getJson(any()),
      ).thenAnswer((_) async => {'data': <dynamic>[]});
      OfflineMutationQueue.instance.pending.value = [
        PendingMutationRecord(
          id: 'edit-1',
          feature: 'inventory',
          method: 'POST',
          path: '/api/v1/workspaces/ws-1/inventory/owners',
          createdAt: DateTime.utc(2026, 9, 29),
          userId: 'user-1',
          workspaceId: 'ws-1',
          payload: const {'name': 'Local owner'},
          optimisticPatch: const {'entityId': 'local-owner'},
        ),
      ];

      expect((await repository.getOwners('ws-1')).map((owner) => owner.name), [
        'Local owner',
      ]);
      expect(await repository.getOwners('ws-2'), isEmpty);
      expect(await repository.getManufacturers('ws-1'), isEmpty);
    },
  );

  test(
    'shows a queued setup choice before any server snapshot exists',
    () async {
      final apiClient = _MockApiClient();
      final repository = InventoryRepository(
        apiClient: apiClient,
        cacheUserId: () => 'user-1',
      );
      when(
        () => apiClient.getJson(any()),
      ).thenThrow(const ApiException.transport(message: 'Offline'));
      OfflineMutationQueue.instance.pending.value = [
        PendingMutationRecord(
          id: 'edit-3',
          feature: 'inventory',
          method: 'POST',
          path: '/api/v1/workspaces/ws-1/inventory/owners',
          createdAt: DateTime.utc(2026, 9, 29),
          userId: 'user-1',
          workspaceId: 'ws-1',
          payload: const {'name': 'Offline owner'},
          optimisticPatch: const {'entityId': 'local-owner'},
        ),
      ];

      expect((await repository.getOwners('ws-1')).map((owner) => owner.name), [
        'Offline owner',
      ]);
    },
  );

  test(
    'keeps confirmed and queued setup rows during an offline refresh',
    () async {
      final apiClient = _MockApiClient();
      final repository = InventoryRepository(
        apiClient: apiClient,
        cacheUserId: () => 'user-1',
      );
      var requests = 0;
      when(() => apiClient.getJson(any())).thenAnswer((_) async {
        requests++;
        if (requests == 1) {
          return {
            'data': [
              {'id': 'owner-1', 'name': 'Confirmed owner'},
            ],
          };
        }
        throw const ApiException.transport(message: 'Offline');
      });
      await repository.getOwners('ws-1');
      OfflineMutationQueue.instance.pending.value = [
        PendingMutationRecord(
          id: 'edit-2',
          feature: 'inventory',
          method: 'POST',
          path: '/api/v1/workspaces/ws-1/inventory/owners',
          createdAt: DateTime.utc(2026, 9, 29),
          userId: 'user-1',
          workspaceId: 'ws-1',
          payload: const {'name': 'Queued owner'},
          optimisticPatch: const {'entityId': 'local-owner'},
        ),
      ];

      await expectLater(
        repository.getOwners('ws-1', forceRefresh: true),
        throwsA(
          isA<ApiException>().having(
            (error) => error.failureKind,
            'failureKind',
            ApiFailureKind.transport,
          ),
        ),
      );
      final owners = await repository.getOwners('ws-1');
      expect(owners.map((owner) => owner.name), [
        'Confirmed owner',
        'Queued owner',
      ]);
    },
  );

  test('shows fresh workspace-scoped overview while revalidating', () async {
    final apiClient = _MockApiClient();
    final repository = InventoryRepository(
      apiClient: apiClient,
      cacheUserId: () => 'user-1',
    );
    when(() => apiClient.getJson(any())).thenAnswer(
      (_) async => {
        'realtime_enabled': false,
        'totals': {
          'wallets_count': 1,
          'total_income': 200,
          'total_expense': 50,
          'inventory_sales_revenue': 150,
          'inventory_sales_count': 2,
        },
        'low_stock_products': <dynamic>[],
        'recent_sales': <dynamic>[],
        'owner_breakdown': <dynamic>[],
        'category_breakdown': <dynamic>[],
      },
    );

    expect(repository.peekOverview('ws-cache'), isNull);
    final first = await repository.getOverview('ws-cache');
    expect(
      repository.peekOverview('ws-cache')?.totals.inventorySalesRevenue,
      150,
    );
    expect(repository.peekOverview('another-workspace'), isNull);
    final second = await repository.getOverview('ws-cache');

    expect(first, second);
    expect(second.totals.inventorySalesRevenue, 150);
    verify(() => apiClient.getJson(any())).called(2);
  });

  test(
    'keeps the complete product options ready for offline checkout',
    () async {
      final apiClient = _MockApiClient();
      final repository = InventoryRepository(
        apiClient: apiClient,
        cacheUserId: () => 'user-1',
      );
      when(() => apiClient.getJson(any())).thenAnswer(
        (_) async => {
          'data': [
            {'id': 'product-1', 'name': 'Notebook'},
            {'id': 'product-2', 'name': 'Pen'},
          ],
        },
      );

      final first = await repository.getProductOptions('ws-catalog');
      final cached = await repository.getProductOptions('ws-catalog');

      expect(first.map((item) => item.name), ['Notebook', 'Pen']);
      expect(cached, first);
      verify(() => apiClient.getJson(any())).called(2);
    },
  );

  test('does not reuse inventory data across workspaces', () async {
    final apiClient = _MockApiClient();
    final repository = InventoryRepository(
      apiClient: apiClient,
      cacheUserId: () => 'user-1',
    );
    when(
      () => apiClient.getJson(any()),
    ).thenAnswer((_) async => _overviewResponse(revenue: 150));

    await repository.getOverview('workspace-a');
    await repository.getOverview('workspace-b');

    verify(() => apiClient.getJson(any())).called(2);
  });

  test('serves stale overview while revalidating in the background', () async {
    final apiClient = _MockApiClient();
    final repository = InventoryRepository(
      apiClient: apiClient,
      cacheUserId: () => 'user-1',
    );
    final refreshedResponse = Completer<Map<String, dynamic>>();
    var requestCount = 0;
    when(() => apiClient.getJson(any())).thenAnswer((_) {
      requestCount += 1;
      if (requestCount == 1) {
        return Future.value(_overviewResponse(revenue: 150));
      }
      return refreshedResponse.future;
    });

    final first = await repository.getOverview('ws-swr');
    await CacheStore.instance.invalidateTags(const [
      'inventory:overview',
    ], workspaceId: 'ws-swr');
    final stale = await repository.getOverview('ws-swr');

    expect(first.totals.inventorySalesRevenue, 150);
    expect(stale.totals.inventorySalesRevenue, 150);
    expect(requestCount, 2);

    final joining = CacheStore.awaitRevalidation(
      () => repository.getOverview('ws-swr'),
    );
    refreshedResponse.complete(_overviewResponse(revenue: 225));
    expect((await joining).totals.inventorySalesRevenue, 225);
    expect(requestCount, 2);

    final refreshed = await repository.getOverview('ws-swr');
    expect(refreshed.totals.inventorySalesRevenue, 225);
    expect(requestCount, 3);
  });

  test(
    'period edits send content fields and allow clearing dates and notes',
    () async {
      final apiClient = _MockApiClient();
      final queue = OfflineMutationQueue.forTesting(
        store: CacheStore.instance,
        userId: () => 'user',
        checkConnectivity: () async => [ConnectivityResult.wifi],
        connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
        apiFactory: (_) => apiClient,
      );
      final repository = InventoryRepository(
        apiClient: apiClient,
        mutationQueue: queue,
        cacheUserId: () => 'user',
      );
      addTearDown(queue.dispose);

      Map<String, dynamic>? requestBody;

      when(() => apiClient.patchJson(any(), any())).thenAnswer((
        invocation,
      ) async {
        requestBody = invocation.positionalArguments[1] as Map<String, dynamic>;
        return {
          'data': {
            'id': 'period-1',
            'name': 'Summer 2027',
            'status': 'active',
            'sale_count': 0,
          },
        };
      });

      final updated = await repository.updateSalesPeriod(
        wsId: 'ws-1',
        periodId: 'period-1',
        name: 'Summer 2027',
        productScope: 'blocklist',
        productIds: const ['product-1'],
      );

      expect(updated.name, 'Summer 2027');
      expect(requestBody, {
        'name': 'Summer 2027',
        'description': null,
        'starts_at': null,
        'ends_at': null,
        'product_scope': 'blocklist',
        'product_ids': ['product-1'],
      });
    },
  );

  test(
    'keeps queued sales periods visible during an offline refresh',
    () async {
      final apiClient = _MockApiClient();
      final queue = _Queue();
      when(
        queue.listPending,
      ).thenAnswer((_) async => OfflineMutationQueue.instance.pending.value);
      final repository = InventoryRepository(
        apiClient: apiClient,
        mutationQueue: queue,
        cacheUserId: () => 'user-1',
      );
      when(
        () => apiClient.getJson(any()),
      ).thenThrow(const ApiException.transport(message: 'Offline'));
      OfflineMutationQueue.instance.pending.value = [
        PendingMutationRecord(
          id: 'period-edit',
          feature: 'inventory',
          method: 'POST',
          path: InventoryEndpoints.salesPeriods('ws-1'),
          createdAt: DateTime.utc(2026, 9, 29),
          userId: 'user-1',
          workspaceId: 'ws-1',
          payload: const {'name': 'Offline season', 'product_scope': 'all'},
          optimisticPatch: const {'entityId': 'local-period'},
        ),
      ];

      final periods = await repository.getSalesPeriods('ws-1');
      expect(periods.map((period) => period.name), ['Offline season']);
      expect(await repository.getSalesPeriods('ws-2'), isEmpty);
    },
  );

  test(
    'durable queued sales paginate once and honor their submitted period',
    () async {
      final api = _MockApiClient();
      final queue = _Queue();
      when(queue.listPending).thenAnswer(
        (_) async => List.generate(
          3,
          (index) => PendingMutationRecord(
            id: 'edit-$index',
            feature: 'inventory',
            method: 'POST',
            path: InventoryEndpoints.invoices('ws'),
            createdAt: DateTime.utc(2026, 1, index + 1),
            userId: 'user',
            workspaceId: 'ws',
            payload: {'inventory_period_id': 'season'},
            optimisticPatch: {'entityId': 'sale-$index'},
          ),
        ),
      );
      final repository = InventoryRepository(
        apiClient: api,
        mutationQueue: queue,
        cacheUserId: () => 'user',
        networkAvailable: () async => false,
      );
      final first = await repository.getSales(
        'ws',
        limit: 2,
        periodId: 'season',
      );
      final second = await repository.getSales(
        'ws',
        limit: 2,
        offset: 2,
        periodId: 'season',
      );
      expect(first.data.map((row) => row.id), ['sale-2', 'sale-1']);
      expect(second.data.single.id, 'sale-0');
      expect(second.count, 3);
      expect(
        (await repository.getSales('ws', periodId: 'other')).data,
        isEmpty,
      );
      verifyNever(() => api.getJson(any()));
      repository.dispose();
    },
  );

  test('shows a queued sale without a confirmed amount', () async {
    final apiClient = _MockApiClient();
    final queue = _Queue();
    when(
      queue.listPending,
    ).thenAnswer((_) async => OfflineMutationQueue.instance.pending.value);
    final repository = InventoryRepository(
      apiClient: apiClient,
      mutationQueue: queue,
      cacheUserId: () => 'user-1',
    );
    when(
      () => apiClient.getJson(any()),
    ).thenThrow(const ApiException.transport(message: 'Offline'));
    OfflineMutationQueue.instance.pending.value = [
      PendingMutationRecord(
        id: 'sale-edit',
        feature: 'inventory',
        method: 'POST',
        path: InventoryEndpoints.invoices('ws-1'),
        createdAt: DateTime.utc(2026, 9, 29),
        userId: 'user-1',
        workspaceId: 'ws-1',
        payload: const {
          'content': 'Offline order',
          'products': [
            {'product_id': 'product-1', 'quantity': 2, 'price': 99},
          ],
        },
        optimisticPatch: const {'entityId': 'local-sale'},
      ),
    ];

    final sales = await repository.getSales('ws-1');
    expect(sales.data.single.notice, 'Offline order');
    expect(sales.data.single.paidAmount, 0);
    expect(sales.count, 1);
    expect((await repository.getSales('ws-2')).data, isEmpty);
  });
  for (final kind in [
    ApiFailureKind.response,
    ApiFailureKind.session,
    ApiFailureKind.unknown,
    ApiFailureKind.transport,
  ]) {
    test(
      'product detail fallback honors $kind failure with a pending create',
      () async {
        final api = _MockApiClient();
        final queue = _Queue();
        final error = ApiException(
          message: 'failure',
          statusCode: 0,
          failureKind: kind,
        );
        when(() => api.getJson(any())).thenThrow(error);
        when(queue.listPending).thenAnswer(
          (_) async => [
            PendingMutationRecord(
              id: 'create-product',
              feature: 'inventory',
              method: 'POST',
              path: InventoryEndpoints.products('ws'),
              createdAt: DateTime.utc(2026),
              userId: 'user',
              workspaceId: 'ws',
              payload: const {'name': 'Pending product'},
              optimisticPatch: const {'entityId': 'local-product'},
            ),
          ],
        );
        final repository = InventoryRepository(
          apiClient: api,
          mutationQueue: queue,
          cacheUserId: () => 'user',
          networkAvailable: () async => true,
        );
        final request = repository.getProduct(
          'ws',
          'local-product',
          forceRefresh: true,
        );
        if (kind == ApiFailureKind.transport) {
          expect((await request)!.name, 'Pending product');
        } else {
          await expectLater(request, throwsA(same(error)));
          verifyNever(queue.listPending);
        }
      },
    );
  }
}

Map<String, dynamic> _overviewResponse({required num revenue}) => {
  'realtime_enabled': false,
  'totals': {
    'wallets_count': 1,
    'total_income': 200,
    'total_expense': 50,
    'inventory_sales_revenue': revenue,
    'inventory_sales_count': 2,
  },
  'low_stock_products': <dynamic>[],
  'recent_sales': <dynamic>[],
  'owner_breakdown': <dynamic>[],
  'category_breakdown': <dynamic>[],
};
