import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/inventory_api_contract_harness.dart';

class _FailingCache extends Mock implements CacheStore {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late InventoryApiContractHarness h;
  const ws = InventoryApiContractHarness.workspace;
  const id = InventoryApiContractHarness.resource;
  const invoice = InventoryApiContractHarness.invoice;
  const base = InventoryApiContractHarness.root;
  const products = [
    {
      'product_id': InventoryApiContractHarness.product,
      'unit_id': id,
      'warehouse_id': id,
      'quantity': 2,
      'price': 12.125,
    },
  ];
  setUp(() async {
    h = InventoryApiContractHarness();
    await h.init();
  });
  tearDown(() async {
    await h.dispose();
  });
  // Live period-invoice.ts allows omitted notes, but rejects JSON null.
  for (final notes in <String?>[null, '', 'Synthetic note']) {
    test(
      'atomic period sale optional notes=$notes uses one durable invoice POST',
      () async {
        h.respond = (req) async {
          expect(req.method, 'POST');
          expect(req.url.path, '$base/finance/invoices');
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          if (body.containsKey('notes') && body['notes'] is! String) {
            return InventoryApiContractHarness.json({
              'message': 'Invalid notes',
            }, status: 400);
          }
          expect(body['customer_id'], isNull);
          expect(body['inventory_period_id'], id);
          expect(
            body['inventory_request_id'],
            matches(RegExp(r'^[0-9a-f-]{36}$')),
          );
          expect(body['price_mode'], 'custom');
          expect(body['products'], products);
          final pending = await h.persistence.queue.listPending();
          expect(pending, hasLength(1));
          expect(
            pending.single.payload?['inventory_request_id'],
            body['inventory_request_id'],
          );
          return InventoryApiContractHarness.json({
            'invoice_id': invoice,
            'data': {'id': invoice, 'total': 24.25},
          });
        };
        expect(
          await h.repository.createSale(
            wsId: ws,
            walletId: id,
            categoryId: id,
            periodId: id,
            products: products,
            notes: notes,
          ),
          invoice,
        );
        expect(h.requests, hasLength(1));
        expect(await h.persistence.queue.listPending(), isEmpty);
      },
    );
  }
  test(
    'unassigned sale consumes invoice_id without period assignment',
    () async {
      h.respond = (req) async {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body.containsKey('inventory_period_id'), false);
        return InventoryApiContractHarness.json({
          'invoice_id': invoice,
          'data': {'id': invoice},
        });
      };
      expect(
        await h.repository.createSale(
          wsId: ws,
          walletId: id,
          products: products,
        ),
        invoice,
      );
      expect(h.requests, hasLength(1));
    },
  );
  test(
    'confirmed invoice remains successful when local invalidation fails',
    () async {
      final cache = _FailingCache();
      when(
        () => cache.invalidateTags(any(), workspaceId: ws),
      ).thenThrow(StateError('Synthetic disk failure'));
      when(
        () => cache.clearScope(
          userId: 'actor',
          workspaceId: ws,
          resourceOnly: true,
        ),
      ).thenAnswer((_) async {});
      final repository = InventoryRepository(
        apiClient: h.api,
        cacheStore: cache,
        mutationQueue: h.persistence.queue,
        cacheUserId: () => 'actor',
      );
      h.respond = (_) async => InventoryApiContractHarness.json({
        'invoice_id': invoice,
        'data': {'id': invoice},
      });
      expect(
        await repository.createSale(wsId: ws, walletId: id, products: products),
        invoice,
      );
      expect(h.requests, hasLength(1));
      expect(await h.persistence.queue.listPending(), isEmpty);
      verify(
        () => cache.clearScope(
          userId: 'actor',
          workspaceId: ws,
          resourceOnly: true,
        ),
      ).called(1);
    },
  );

  test(
    'product CRUD preserves fractional currency and integer stock payloads',
    () async {
      const stock = [
        InventoryStockEntry(
          unitId: id,
          warehouseId: id,
          amount: 12,
          minAmount: 2,
          price: 12.125,
        ),
      ];
      h.respond = (req) async {
        if (req.method == 'POST') {
          expect(req.url.path, '$base/inventory/offline-mutations');
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          expect(body['kind'], 'product');
          final payload = body['payload'] as Map<String, dynamic>;
          final row = (payload['inventory'] as List).single as Map;
          expect(row['price'], 12.125);
          expect(row['amount'], 12);
          return InventoryApiContractHarness.json({
            'contract': 'inventory-offline-create-v1',
            'resource': 'product',
            'data': {
              'id': InventoryApiContractHarness.product,
              'name': 'Synthetic product',
            },
          });
        }
        expect(
          req.url.path,
          '$base/products/${InventoryApiContractHarness.product}',
        );
        if (req.method == 'PATCH') {
          final payload = jsonDecode(req.body) as Map<String, dynamic>;
          final row = (payload['inventory'] as List).single as Map;
          expect(row['price'], 12.125);
        } else {
          expect(req.method, 'DELETE');
        }
        return InventoryApiContractHarness.json({'message': 'Success'});
      };
      await h.repository.createProduct(
        wsId: ws,
        name: 'Synthetic product',
        categoryId: id,
        ownerId: id,
        inventory: stock,
      );
      await h.repository.updateProduct(
        wsId: ws,
        productId: InventoryApiContractHarness.product,
        name: 'Updated synthetic product',
        categoryId: id,
        ownerId: id,
        inventory: stock,
      );
      await h.repository.deleteProduct(
        wsId: ws,
        productId: InventoryApiContractHarness.product,
      );
      expect(h.requests.map((r) => r.method), ['POST', 'PATCH', 'DELETE']);
      expect(await h.persistence.queue.listPending(), isEmpty);
    },
  );

  test(
    'confirmed receipt survives both local invalidation and eviction failure',
    () async {
      final cache = _FailingCache();
      when(
        () => cache.invalidateTags(any(), workspaceId: ws),
      ).thenThrow(StateError('Synthetic disk failure'));
      when(
        () => cache.clearScope(
          userId: 'actor',
          workspaceId: ws,
          resourceOnly: true,
        ),
      ).thenThrow(StateError('Synthetic eviction failure'));
      final repository = InventoryRepository(
        apiClient: h.api,
        cacheStore: cache,
        mutationQueue: h.persistence.queue,
        cacheUserId: () => 'actor',
      );
      h.respond = (_) async => InventoryApiContractHarness.json({
        'invoice_id': invoice,
        'data': {'id': invoice},
      });
      expect(
        await repository.createSale(wsId: ws, walletId: id, products: products),
        invoice,
      );
      expect(h.requests, hasLength(1));
      expect(await h.persistence.queue.listPending(), isEmpty);
    },
  );

  test('server rejection never invokes post-ack cache maintenance', () async {
    final cache = _FailingCache();
    final repository = InventoryRepository(
      apiClient: h.api,
      cacheStore: cache,
      mutationQueue: h.persistence.queue,
      cacheUserId: () => 'actor',
    );
    h.respond = (_) async =>
        InventoryApiContractHarness.json({'message': 'Denied'}, status: 403);
    await expectLater(
      repository.createSale(wsId: ws, walletId: id, products: products),
      throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 403)),
    );
    verifyNever(() => cache.invalidateTags(any(), workspaceId: ws));
    expect(h.requests, hasLength(1));
  });

  test(
    'sale cache fallback stays on captured actor during account change',
    () async {
      var actor = 'actor';
      final cache = _FailingCache();
      when(() => cache.invalidateTags(any(), workspaceId: ws)).thenAnswer((
        _,
      ) async {
        actor = 'next-actor';
        throw StateError('Synthetic invalidation failure');
      });
      when(
        () => cache.clearScope(
          userId: 'actor',
          workspaceId: ws,
          resourceOnly: true,
        ),
      ).thenAnswer((_) async {});
      final repository = InventoryRepository(
        apiClient: h.api,
        cacheStore: cache,
        mutationQueue: h.persistence.queue,
        cacheUserId: () => actor,
      );
      h.respond = (_) async => InventoryApiContractHarness.json({
        'invoice_id': invoice,
        'data': {'id': invoice},
      });
      expect(
        await repository.createSale(wsId: ws, walletId: id, products: products),
        invoice,
      );
      verify(
        () => cache.clearScope(
          userId: 'actor',
          workspaceId: ws,
          resourceOnly: true,
        ),
      ).called(1);
      verifyNever(
        () => cache.clearScope(
          userId: 'next-actor',
          workspaceId: ws,
          resourceOnly: true,
        ),
      );
    },
  );

  final creates = <String, Future<void> Function(InventoryRepository)>{
    'owner': (r) => r.createOwner(ws, 'Synthetic choice'),
    'manufacturer': (r) => r.createManufacturer(ws, 'Synthetic choice'),
    'category': (r) => r.createProductCategory(ws, 'Synthetic choice'),
    'unit': (r) => r.createProductUnit(ws, 'Synthetic choice'),
    'warehouse': (r) => r.createProductWarehouse(ws, 'Synthetic choice'),
  };
  for (final entry in creates.entries) {
    test('${entry.key} create persists explicit contract before HTTP '
        'and acknowledges UUID', () async {
      h.respond = (req) async {
        expect(req.method, 'POST');
        expect(req.url.path, '$base/inventory/offline-mutations');
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['kind'], entry.key);
        expect(body['payload'], {'name': 'Synthetic choice'});
        expect(
          (await h.persistence.queue.listPending()).single.entityId,
          body['operation_id'],
        );
        return InventoryApiContractHarness.json({
          'contract': 'inventory-offline-create-v1',
          'resource': entry.key,
          'data': {'id': id, 'name': 'Synthetic choice'},
        });
      };
      await entry.value(h.repository);
      expect(await h.persistence.queue.listPending(), isEmpty);
      expect(h.requests, hasLength(1));
    });
  }
  final paths = <InventorySetupKind, String>{
    InventorySetupKind.owner: 'inventory/owners',
    InventorySetupKind.manufacturer: 'inventory/manufacturers',
    InventorySetupKind.category: 'product-categories',
    InventorySetupKind.unit: 'product-units',
    InventorySetupKind.warehouse: 'product-warehouses',
  };
  for (final entry in paths.entries) {
    test(
      '${entry.key.name} update/delete preserve owning methods and IDs',
      () async {
        h.respond = (req) async {
          expect(req.url.path, '$base/${entry.value}/$id');
          if (req.method != 'DELETE') {
            expect(
              req.method,
              entry.key == InventorySetupKind.owner ||
                      entry.key == InventorySetupKind.manufacturer
                  ? 'PATCH'
                  : 'PUT',
            );
            expect(jsonDecode(req.body), {'name': 'Renamed synthetic choice'});
          }
          return InventoryApiContractHarness.json({
            'data': {'id': id, 'name': 'Renamed synthetic choice'},
          });
        };
        await h.repository.updateSetupItem(
          wsId: ws,
          kind: entry.key,
          id: id,
          name: 'Renamed synthetic choice',
        );
        await h.repository.deleteSetupItem(wsId: ws, kind: entry.key, id: id);
        expect(h.requests.map((r) => r.method).last, 'DELETE');
        expect(h.requests, hasLength(2));
        expect(await h.persistence.queue.listPending(), isEmpty);
      },
    );
  }
  for (final status in [400, 401, 403, 409, 422]) {
    test('sale HTTP$status cannot report a created invoice', () async {
      h.respond = (_) async => InventoryApiContractHarness.json({
        'message': 'Synthetic rejection',
      }, status: status);
      await expectLater(
        h.repository.createSale(
          wsId: ws,
          walletId: id,
          products: products,
          periodId: id,
        ),
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'status', status),
        ),
      );
      expect(h.requests, hasLength(status == 401 ? 4 : 1));
      expect(await h.persistence.queue.listPending(), hasLength(1));
    });
  }
}
