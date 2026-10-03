import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_inventory_mutation.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/offline_inventory_harness.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Api api;
  late OfflineInventoryHarness harness;
  PendingMutationRecord record(String id, {String owner = 'actor'}) =>
      PendingMutationRecord(
        id: id,
        feature: 'inventory',
        userId: owner,
        workspaceId: 'ws',
        method: 'PATCH',
        path: '/api/v1/workspaces/ws/products/$id',
        createdAt: DateTime.utc(2026, 10, 3),
        payload: const {'name': 'Synthetic'},
      );
  setUp(() async {
    api = _Api();
    harness = await OfflineInventoryHarness.create(api, online: false);
  });
  tearDown(() async {
    await harness.dispose();
  });

  test(
    'scope purge serializes earlier acknowledgment and later enqueue',
    () async {
      await harness.store.savePendingMutation(record('old'));
      await harness.store.savePendingMutation(record('other', owner: 'other'));
      final acknowledgment = harness.store.updatePendingMutation(
        'old',
        (current) => current.copyWith(acknowledgedWrite: true),
      );
      final purge = harness.store.clearScope(
        userId: 'actor',
        workspaceId: 'ws',
      );
      final later = harness.store.savePendingMutation(record('new'));
      await Future.wait([acknowledgment, purge, later]);
      expect(
        (await harness.store.listPendingMutations()).map((r) => r.id),
        containsAll(['new', 'other']),
      );
      expect(
        (await harness.store.listPendingMutations()).map((r) => r.id),
        isNot(contains('old')),
      );
    },
  );

  test(
    'corrupt record is visible conflict without stopping healthy replay',
    () async {
      final box = Hive.box<dynamic>('offline_mutations_v1');
      final corrupt = {
        'id': 'bad',
        'userId': 'actor',
        'workspaceId': 'ws',
        'feature': 'inventory',
        'createdAt': 'malformed',
      };
      await box.put('bad', corrupt);
      await harness.store.savePendingMutation(record('good'));
      final rows = await harness.store.listPendingMutations();
      final bad = rows.singleWhere((r) => r.id == 'bad');
      expect(bad.status, PendingMutationStatus.conflict);
      expect(bad.dependencyIssue, OfflineDependencyIssue.invalidPayload);
      expect(rows.singleWhere((r) => r.id == 'good').method, 'PATCH');
      expect(box.get('bad'), corrupt);
      await harness.store.clearScope(userId: 'actor', workspaceId: 'ws');
      expect(await harness.store.listPendingMutations(), isEmpty);
    },
  );

  test('malformed origin and tombstone do not block valid metadata', () async {
    final box = Hive.box<dynamic>('offline_entities_v1');
    for (final kind in ['local-origin', 'local-deleted']) {
      await box.put('bad-$kind', {
        'kind': kind,
        'userId': 'actor',
        'workspaceId': 'ws',
        'resource': 7,
      });
      await box.put('good-$kind', {
        'kind': kind,
        'userId': 'actor',
        'workspaceId': 'ws',
        'feature': 'inventory',
        'resource': 'category',
        'localId': 'local',
      });
    }
    expect(
      await harness.store.localResourceOrigins(
        userId: 'actor',
        workspaceId: 'ws',
      ),
      hasLength(1),
    );
    expect(
      await harness.store.deletedOfflineResources(
        userId: 'actor',
        workspaceId: 'ws',
      ),
      hasLength(1),
    );
  });

  test('malformed URI is rejected without aborting record classification', () {
    final malformed = PendingMutationRecord.fromJson({
      ...record('uri').toJson(),
      'path': 'http://[invalid',
    });
    expect(OfflineInventoryMutation.fromRecord(malformed), isNull);
    expect(OfflineInventoryMutation.fromRecord(record('valid')), isNotNull);
  });

  for (final clear in [true, false]) {
    test(
      'acknowledged sale period ${clear ? 'clear stays null' : 'parses data'}',
      () async {
        await harness.dispose();
        harness = await OfflineInventoryHarness.create(api);
        when(() => api.putJson(any(), any())).thenAnswer(
          (_) async => {
            'data': clear
                ? null
                : {
                    'id': 'period',
                    'name': 'Synthetic',
                    'status': 'active',
                    'sale_count': 2,
                  },
          },
        );
        final repository = InventoryRepository(
          apiClient: api,
          cacheStore: harness.store,
          mutationQueue: harness.queue,
          cacheUserId: () => 'actor',
        );
        final period = await repository.setSalePeriod(
          wsId: 'ws',
          saleId: 'sale',
          source: 'finance_invoice',
          periodId: clear ? null : 'period',
        );
        if (clear) {
          expect(period, isNull);
        } else {
          expect(period?.id, 'period');
          expect(period?.name, 'Synthetic');
          expect(period?.saleCount, 2);
        }
        expect(await harness.queue.listPending(), isEmpty);
      },
    );
  }

  test('acknowledged sale edit parses unwrapped server data', () async {
    await harness.dispose();
    harness = await OfflineInventoryHarness.create(api);
    when(() => api.putJson(any(), any())).thenAnswer(
      (_) async => {
        'data': {
          'id': 'sale',
          'notice': 'Synthetic notice',
          'note': 'Synthetic note',
          'paid_amount': 42,
          'items_count': 3,
          'total_quantity': 5,
          'source': 'finance_invoice',
        },
      },
    );
    final repository = InventoryRepository(
      apiClient: api,
      cacheStore: harness.store,
      mutationQueue: harness.queue,
      cacheUserId: () => 'actor',
    );
    final sale = await repository.updateSale(
      wsId: 'ws',
      saleId: 'sale',
      notice: 'Synthetic notice',
      note: 'Synthetic note',
    );
    expect(sale.id, 'sale');
    expect(sale.notice, 'Synthetic notice');
    expect(sale.note, 'Synthetic note');
    expect(sale.paidAmount, 42);
    expect(sale.itemsCount, 3);
    expect(sale.totalQuantity, 5);
    expect(await harness.queue.listPending(), isEmpty);
  });
}
