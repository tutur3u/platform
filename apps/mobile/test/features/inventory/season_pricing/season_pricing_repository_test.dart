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
  Map<String, dynamic>? receipt;
  bool? readAuthenticated;
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    readPath = path;
    readAuthenticated = requiresAuth;
    if (receipt != null) return receipt!;
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
    'receipt reads are authenticated, scoped and fail closed on bad identity',
    () async {
      final api = _Api();
      final repository = InventoryRepository(apiClient: api);
      api.receipt = {'state': 'not_observed', 'request_id': 'request'};
      expect(await repository.getSaleReceipt('ws', 'request'), isNull);
      expect(api.readAuthenticated, isTrue);
      expect(api.readPath, InventoryEndpoints.saleReceipt('ws', 'request'));
      api.receipt = {
        'state': 'committed',
        'request_id': 'request',
        'invoice_id': 'invoice',
      };
      expect(await repository.getSaleReceipt('ws', 'request'), 'invoice');
      api.receipt = {
        'state': 'committed',
        'request_id': 'other',
        'invoice_id': 'invoice',
      };
      await expectLater(
        repository.getSaleReceipt('ws', 'request'),
        throwsFormatException,
      );
      api.receipt = {
        'state': 'committed',
        'request_id': 'request',
        'invoice_id': '',
      };
      await expectLater(
        repository.getSaleReceipt('ws', 'request'),
        throwsFormatException,
      );
      expect(api.writePath, isNull);
    },
  );
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
