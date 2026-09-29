import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

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
      final repository = InventoryRepository(apiClient: apiClient);
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
      final repository = InventoryRepository(apiClient: apiClient);
      when(
        () => apiClient.getJson(any()),
      ).thenThrow(const ApiException(message: 'Offline', statusCode: 0));
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
      final repository = InventoryRepository(apiClient: apiClient);
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
        throw const ApiException(message: 'Offline', statusCode: 0);
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

      final owners = await repository.getOwners('ws-1', forceRefresh: true);
      expect(owners.map((owner) => owner.name), [
        'Confirmed owner',
        'Queued owner',
      ]);
    },
  );

  test('shows fresh workspace-scoped overview while revalidating', () async {
    final apiClient = _MockApiClient();
    final repository = InventoryRepository(apiClient: apiClient);
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
      final repository = InventoryRepository(apiClient: apiClient);
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
    final repository = InventoryRepository(apiClient: apiClient);
    when(
      () => apiClient.getJson(any()),
    ).thenAnswer((_) async => _overviewResponse(revenue: 150));

    await repository.getOverview('workspace-a');
    await repository.getOverview('workspace-b');

    verify(() => apiClient.getJson(any())).called(2);
  });

  test('serves stale overview while revalidating in the background', () async {
    final apiClient = _MockApiClient();
    final repository = InventoryRepository(apiClient: apiClient);
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

    refreshedResponse.complete(_overviewResponse(revenue: 225));
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final refreshed = await repository.getOverview('ws-swr');
    expect(refreshed.totals.inventorySalesRevenue, 225);
    expect(requestCount, 3);
  });

  test(
    'period edits send content fields and allow clearing dates and notes',
    () async {
      final apiClient = _MockApiClient();
      final repository = InventoryRepository(apiClient: apiClient);
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

      await repository.updateSalesPeriod(
        wsId: 'ws-1',
        periodId: 'period-1',
        name: 'Summer 2027',
        productScope: 'blocklist',
        productIds: const ['product-1'],
      );

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
