import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

import 'season_pricing_controller_test.dart' show priceRow;

class _Cache extends Mock implements CacheStore {}

class _Api extends ApiClient {
  String? readPath;
  String? writePath;
  Map<String, dynamic>? body;
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    readPath = path;
    if (path.contains('/prices')) {
      return {
        'data': [priceRow()],
        'as_of': '2026-10-01T01:00:00Z',
      };
    }
    return {
      'data': [
        {
          'id': 'season',
          'name': 'Season',
          'pricing_mode': 'scheduled',
          'time_zone': 'Asia/Ho_Chi_Minh',
          'status': 'active',
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? payload, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    writePath = path;
    body = payload! as Map<String, dynamic>;
    return {'invoice_id': 'invoice'};
  }
}

void main() {
  test(
    'uncached quote path escapes both IDs and preserves server as_of',
    () async {
      final api = _Api();
      final repository = InventoryRepository(apiClient: api);
      final quote = await repository.getSeasonQuote(
        'workspace space',
        'season space',
      );
      expect(
        api.readPath,
        contains(
          'workspace%20space/inventory/sales-periods/season%20space/prices',
        ),
      );
      expect(quote.asOf, DateTime.utc(2026, 10, 1, 1));
      final periods = await repository.getCheckoutSalesPeriods('ws');
      expect(periods.single.isScheduled, isTrue);
      expect(periods.single.timeZone, 'Asia/Ho_Chi_Minh');
    },
  );
  test('scheduled sale uses only direct atomic finance POST '
      'then invalidates reads', () async {
    final api = _Api();
    final cache = _Cache();
    when(
      () => cache.invalidateTags(any(), workspaceId: 'ws'),
    ).thenAnswer((_) async {});
    final repository = InventoryRepository(apiClient: api, cacheStore: cache);
    final payload = <String, dynamic>{
      'price_mode': 'custom',
      'inventory_period_id': 'season',
      'inventory_request_id': 'stable',
      'products': [
        {'price_id': 'quoted'},
      ],
    };
    expect(await repository.sendScheduledSale('ws', payload), 'invoice');
    expect(api.writePath, InventoryEndpoints.invoices('ws'));
    expect(api.body, same(payload));
    verify(() => cache.invalidateTags(any(), workspaceId: 'ws')).called(1);
    // No separate assignment, optimistic ID, or offline replay.
    expect(api.readPath, isNull);
  });
}
