import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';

void main() {
  group('inventory sales periods', () {
    test('parses period metadata on mixed-source sale summaries', () {
      final sale = InventorySaleSummary.fromJson(const <String, dynamic>{
        'id': 'sale-1',
        'source': 'checkout_session',
        'paid_amount': 125000,
        'items_count': 2,
        'total_quantity': 3,
        'owners': <String>[],
        'period': <String, dynamic>{
          'id': 'period-1',
          'name': 'TuCon 2026',
          'description': 'Convention floor sales',
          'starts_at': '2026-08-08',
          'ends_at': '2026-08-09',
          'status': 'active',
          'sale_count': 42,
          'product_scope': 'allowlist',
          'product_ids': <String>['product-1', 'product-2'],
        },
      });

      expect(sale.source, 'checkout_session');
      expect(sale.period?.name, 'TuCon 2026');
      expect(sale.period?.saleCount, 42);
      expect(sale.period?.startsAt, DateTime(2026, 8, 8));
      expect(sale.period?.productScope, 'allowlist');
      expect(sale.period?.productIds, ['product-1', 'product-2']);
    });

    test('builds period-aware inventory API paths', () {
      expect(
        InventoryEndpoints.sales(
          'workspace-1',
          limit: 24,
          offset: 48,
          periodId: 'period-1',
        ),
        '/api/v1/workspaces/workspace-1/inventory/sales'
        '?limit=24&offset=48&period_id=period-1',
      );
      expect(
        InventoryEndpoints.salesPeriods(
          'workspace-1',
          includeArchived: true,
        ),
        '/api/v1/workspaces/workspace-1/inventory/sales-periods'
        '?include_archived=true',
      );
      expect(
        InventoryEndpoints.salePeriod('workspace-1', 'sale-1'),
        '/api/v1/workspaces/workspace-1/inventory/sales/sale-1/period',
      );
    });
  });
}
