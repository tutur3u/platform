import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/offline_inventory_harness.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Api api;
  late OfflineInventoryHarness harness;
  late InventoryRepository repository;

  setUp(() async {
    api = _Api();
    harness = await OfflineInventoryHarness.create(api, online: false);
    repository = InventoryRepository(
      apiClient: api,
      cacheStore: harness.store,
      mutationQueue: harness.queue,
      cacheUserId: () => 'actor',
      networkAvailable: () async => false,
    );
    await harness.store.write(
      key: CacheKey(
        namespace: 'inventory.sales-periods',
        userId: 'actor',
        workspaceId: 'ws',
        locale: currentCacheLocaleTag(),
        params: const {'includeArchived': 'true'},
      ),
      policy: CachePolicies.offlineCatalog,
      payload: {
        'data': [
          {'id': 'new-period', 'name': 'New period', 'status': 'active'},
        ],
      },
    );
  });

  tearDown(() async {
    repository.dispose();
    await harness.dispose();
  });

  Future<void> saveDetail() => harness.store.write(
    key: CacheKey(
      namespace: 'inventory.sale-detail',
      userId: 'actor',
      workspaceId: 'ws',
      locale: currentCacheLocaleTag(),
      params: const {'saleId': 'confirmed-sale'},
    ),
    policy: const CachePolicy(
      staleAfter: Duration.zero,
      expireAfter: Duration(days: 365),
    ),
    payload: {
      'data': {
        'id': 'confirmed-sale',
        'notice': 'Retained notice',
        'note': 'Retained note',
        'wallet_id': 'wallet',
        'customer_id': 'customer',
        'customer_name': 'Customer',
        'creator_name': 'Creator',
        'paid_amount': 42,
        'items_count': 1,
        'total_quantity': 2,
        'lines': [
          {'product_id': 'product', 'quantity': 2, 'price': 21},
        ],
        'period': {'id': 'old-period', 'name': 'Old period'},
      },
    },
  );

  Future<void> assign(String saleId, String? period, {String ws = 'ws'}) =>
      harness.queue.enqueue(
        PendingMutationRecord(
          id: 'assignment-${harness.queue.pending.value.length}',
          feature: 'inventory',
          method: 'PUT',
          path: InventoryEndpoints.salePeriod(ws, saleId),
          userId: 'actor',
          workspaceId: ws,
          createdAt: DateTime.now().toUtc(),
          payload: {'period_id': period, 'source': 'finance_invoice'},
          optimisticPatch: {'entityId': saleId},
        ),
      );

  test(
    'reopened stale offline sale projects assignment and explicit clearing',
    () async {
      await saveDetail();
      await assign('confirmed-sale', 'new-period');
      final assigned = await repository.getSaleDetail('ws', 'confirmed-sale');
      expect(assigned.period?.id, 'new-period');
      expect(assigned.notice, 'Retained notice');
      expect(assigned.note, 'Retained note');
      expect(assigned.walletId, 'wallet');
      expect(assigned.customerId, 'customer');
      expect(assigned.creatorName, 'Creator');
      expect(assigned.totalQuantity, 2);
      expect(assigned.paidAmount, 42);
      expect(assigned.lines.single.productId, 'product');
      await assign('confirmed-sale', null);
      expect(
        (await repository.getSaleDetail('ws', 'confirmed-sale')).period,
        isNull,
      );
      verifyNever(() => api.getJson(any()));
      verifyNever(() => api.putJson(any(), any()));
      expect(await harness.queue.listPending(), hasLength(2));
    },
  );

  test(
    'pending sale retains local ID and projects its queued period without HTTP',
    () async {
      final id = await repository.queueScheduledSale('ws', {
        'inventory_request_id': 'local-sale',
        'content': 'Queued sale',
        'products': <Map<String, dynamic>>[],
      });
      await assign(id, 'new-period');
      final detail = await repository.getSaleDetail('ws', id);
      expect(detail.id, 'local-sale');
      expect(detail.notice, 'Queued sale');
      expect(detail.period?.id, 'new-period');
      await assign(id, null);
      expect((await repository.getSaleDetail('ws', id)).period, isNull);
      verifyNever(() => api.getJson(any()));
      verifyNever(() => api.putJson(any(), any()));
      verifyNever(() => api.postJson(any(), any()));
      expect(await harness.queue.listPending(), hasLength(3));
    },
  );

  test('another workspace assignment does not alter the saved sale', () async {
    await saveDetail();
    await assign('confirmed-sale', 'new-period', ws: 'other');
    expect(
      (await repository.getSaleDetail('ws', 'confirmed-sale')).period?.id,
      'old-period',
    );
    verifyNever(() => api.getJson(any()));
  });

  test(
    'snapshot precedes connectivity hint and revalidates once on entry',
    () async {
      await saveDetail();
      repository.dispose();
      final connectivity = Completer<bool>();
      repository = InventoryRepository(
        apiClient: api,
        cacheStore: harness.store,
        mutationQueue: harness.queue,
        cacheUserId: () => 'actor',
        networkAvailable: () => connectivity.future,
      );
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'data': {'id': 'confirmed-sale', 'notice': 'Current notice'},
        },
      );
      final saved = Completer<InventorySaleDetail>();
      final entry = CacheStore.readWithRevalidation(
        () => repository.getSaleDetail('ws', 'confirmed-sale'),
        onSnapshot: saved.complete,
      );
      expect((await saved.future).notice, 'Retained notice');
      verifyNever(() => api.getJson(any()));
      connectivity.complete(true);
      expect((await entry).notice, 'Current notice');
      verify(() => api.getJson(any())).called(1);
    },
  );
}
