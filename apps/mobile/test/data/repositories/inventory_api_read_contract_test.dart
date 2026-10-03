import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';

import '../../helpers/inventory_api_contract_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late InventoryApiContractHarness h;
  const ws = InventoryApiContractHarness.workspace;
  const id = InventoryApiContractHarness.resource;
  const productId = InventoryApiContractHarness.product;
  const base = InventoryApiContractHarness.root;
  const product = {
    'id': productId,
    'name': 'Synthetic product',
    'ws_id': ws,
    'category_id': id,
    'owner_id': id,
    'inventory': [
      {
        'unit_id': id,
        'warehouse_id': id,
        'amount': 12,
        'min_amount': 2,
        'price': 12.125,
      },
    ],
  };
  const period = {
    'id': id,
    'name': 'Synthetic period',
    'status': 'active',
    'sale_count': 3,
    'product_scope': 'all',
  };
  const sale = {
    'id': id,
    'notice': 'Synthetic sale',
    'paid_amount': 24.25,
    'items_count': 1,
    'total_quantity': 2,
    'source': 'finance_invoice',
  };
  setUp(() async {
    h = InventoryApiContractHarness();
    await h.init();
  });
  tearDown(() async {
    await h.dispose();
  });

  test(
    'catalog pagination/query and nested stock use authorized GET contract',
    () async {
      h.respond = (req) async {
        expect(req.method, 'GET');
        expect(req.url.path, '$base/inventory/products');
        expect(req.url.queryParameters, {
          'q': 'Synthetic + row',
          'status': 'active',
          'page': '2',
          'pageSize': '7',
        });
        return InventoryApiContractHarness.json({
          'data': [product],
          'count': 21,
        });
      };
      final rows = await h.repository.getProducts(
        ws,
        query: ' Synthetic + row ',
        page: 2,
        pageSize: 7,
        forceRefresh: true,
      );
      expect(rows.count, 21);
      expect(rows.data.single.id, productId);
      expect(rows.data.single.inventory.single.price, 12.125);
      expect(rows.data.single.inventory.single.amount, 12);
      expect(h.requests, hasLength(1));
    },
  );

  test(
    'product detail consumes direct object rather than list/data envelope',
    () async {
      h.respond = (req) async {
        expect(req.url.path, '$base/products/$productId');
        return InventoryApiContractHarness.json(product);
      };
      final row = await h.repository.getProduct(
        ws,
        productId,
        forceRefresh: true,
      );
      expect(row?.name, 'Synthetic product');
      expect(row?.inventory.single.warehouseId, id);
    },
  );

  test(
    'product options consume data array and preserve IDs for checkout',
    () async {
      h.respond = (req) async {
        expect(req.url.path, '$base/products/options');
        return InventoryApiContractHarness.json({
          'data': [
            {
              'id': productId,
              'name': 'Synthetic product',
              'inventory_products': [
                {
                  'unit_id': id,
                  'warehouse_id': id,
                  'amount': 12,
                  'min_amount': 2,
                  'price': 12.125,
                  'inventory_units': {'name': 'Item'},
                  'inventory_warehouses': {'name': 'Synthetic warehouse'},
                },
              ],
            },
          ],
        });
      };
      final rows = await h.repository.getProductOptions(ws, forceRefresh: true);
      expect(rows.single.id, productId);
      expect(rows.single.inventory.single.unitId, id);
    },
  );

  final setup =
      <String, Future<List<String>> Function(InventoryApiContractHarness)>{
        'inventory/owners': (h) async => (await h.repository.getOwners(
          ws,
          forceRefresh: true,
        )).map((v) => v.name).toList(),
        'inventory/manufacturers': (h) async =>
            (await h.repository.getManufacturers(
              ws,
              forceRefresh: true,
            )).map((v) => v.name).toList(),
        'product-categories': (h) async =>
            (await h.repository.getProductCategories(
              ws,
              forceRefresh: true,
            )).map((v) => v.name).toList(),
        'product-units': (h) async => (await h.repository.getProductUnits(
          ws,
          forceRefresh: true,
        )).map((v) => v.name).toList(),
        'product-warehouses': (h) async =>
            (await h.repository.getProductWarehouses(
              ws,
              forceRefresh: true,
            )).map((v) => v.name).toList(),
      };
  for (final entry in setup.entries) {
    test(
      '${entry.key} reads server data envelope and surfaces denial',
      () async {
        var denied = false;
        h.respond = (req) async {
          expect(req.url.path, '$base/${entry.key}');
          return denied
              ? InventoryApiContractHarness.json({
                  'message': 'Permission denied',
                }, status: 403)
              : InventoryApiContractHarness.json({
                  'data': [
                    {'id': id, 'name': 'Synthetic choice'},
                  ],
                });
        };
        expect(await entry.value(h), ['Synthetic choice']);
        denied = true;
        await expectLater(
          entry.value(h),
          throwsA(
            isA<ApiException>().having((e) => e.statusCode, 'status', 403),
          ),
        );
        expect(await h.persistence.queue.listPending(), isEmpty);
      },
    );
  }

  test(
    'sales pagination/filter and detail preserve server monetary/source fields',
    () async {
      h.respond = (req) async {
        if (req.url.path.endsWith('/$id')) {
          return InventoryApiContractHarness.json({'data': sale});
        }
        expect(req.url.path, '$base/inventory/sales');
        expect(req.url.queryParameters, {
          'limit': '8',
          'offset': '16',
          'period_id': id,
        });
        return InventoryApiContractHarness.json({
          'data': [sale],
          'count': 25,
          'realtime_enabled': true,
        });
      };
      final rows = await h.repository.getSales(
        ws,
        limit: 8,
        offset: 16,
        periodId: id,
        forceRefresh: true,
      );
      expect(rows.count, 25);
      expect(rows.realtimeEnabled, true);
      expect(rows.data.single.paidAmount, 24.25);
      final detail = await h.repository.getSaleDetail(
        ws,
        id,
        forceRefresh: true,
      );
      expect(detail.id, id);
      expect(detail.paidAmount, 24.25);
    },
  );

  test(
    'period list and checkout defaults use distinct server envelopes',
    () async {
      h.respond = (req) async {
        if (req.url.path.endsWith('/product-form-options')) {
          return InventoryApiContractHarness.json({
            'defaultSalesPeriodId': id,
            'defaultRevenueWalletId': productId,
            'defaultFinanceCategoryId': id,
          });
        }
        expect(req.url.queryParameters['include_archived'], 'false');
        return InventoryApiContractHarness.json({
          'data': [period],
        });
      };
      expect(
        (await h.repository.getCheckoutSalesPeriods(ws)).single.saleCount,
        3,
      );
      final defaults = await h.repository.getCheckoutDefaults(ws);
      expect(defaults.salesPeriodId, id);
      expect(defaults.revenueWalletId, productId);
    },
  );

  test(
    'overview aggregate preserves totals instead of silently empty rows',
    () async {
      h.respond = (_) async => InventoryApiContractHarness.json({
        'totals': {
          'wallets_count': 2,
          'inventory_sales_revenue': 123.125,
          'inventory_sales_count': 3,
        },
        'realtime_enabled': true,
        'recent_sales': [sale],
      });
      final overview = await h.repository.getOverview(ws, forceRefresh: true);
      expect(overview.totals.inventorySalesRevenue, 123.125);
      expect(overview.totals.inventorySalesCount, 3);
      expect(overview.recentSales.single.id, id);
    },
  );

  for (final status in [401, 403, 422]) {
    test('catalog HTTP$status is an error rather than cached success '
        'or queued write', () async {
      h.respond = (_) async => InventoryApiContractHarness.json({
        'message': 'Synthetic rejection',
      }, status: status);
      await expectLater(
        h.repository.getProducts(ws, forceRefresh: true),
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'status', status),
        ),
      );
      expect(await h.persistence.queue.listPending(), isEmpty);
    });
  }
}
