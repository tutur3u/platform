import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await CacheStore.instance.clearScope();
  });

  test('reuses fresh workspace-scoped overview data from cache', () async {
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

    final first = await repository.getOverview('ws-cache');
    final second = await repository.getOverview('ws-cache');

    expect(first, second);
    expect(second.totals.inventorySalesRevenue, 150);
    verify(() => apiClient.getJson(any())).called(1);
  });

  test('does not reuse inventory data across workspaces', () async {
    final apiClient = _MockApiClient();
    final repository = InventoryRepository(apiClient: apiClient);
    when(() => apiClient.getJson(any())).thenAnswer(
      (_) async => _overviewResponse(revenue: 150),
    );

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
    await CacheStore.instance.invalidateTags(
      const ['inventory:overview'],
      workspaceId: 'ws-swr',
    );
    final stale = await repository.getOverview('ws-swr');

    expect(first.totals.inventorySalesRevenue, 150);
    expect(stale.totals.inventorySalesRevenue, 150);
    expect(requestCount, 2);

    refreshedResponse.complete(_overviewResponse(revenue: 225));
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final refreshed = await repository.getOverview('ws-swr');
    expect(refreshed.totals.inventorySalesRevenue, 225);
    expect(requestCount, 2);
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
