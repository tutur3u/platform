import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _SecureStorage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

Map<String, dynamic> _product(
  String id,
  String name,
  int day, {
  String? description,
  bool archived = false,
}) => {
  'id': id,
  'name': name,
  'description': description,
  'ws_id': 'ws',
  'category_id': 'category',
  'owner_id': 'owner',
  'archived': archived,
  'created_at': '2026-10-${day.toString().padLeft(2, '0')}T00:00:00Z',
  'inventory': <Map<String, dynamic>>[],
};
Map<String, dynamic> _transaction(String id, String description, int day) => {
  'id': id,
  'description': description,
  'wallet_id': 'wallet',
  'amount': -10,
  'taken_at': '2026-10-${day.toString().padLeft(2, '0')}T00:00:00Z',
};
Map<String, dynamic> _sale(String id, int day) => {
  'id': id,
  'notice': 'Sale $id',
  'paid_amount': 100,
  'created_at': '2026-10-${day.toString().padLeft(2, '0')}T00:00:00Z',
  'owners': <String>[],
  'lines': <Map<String, dynamic>>[],
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late OfflineMutationQueue queue;
  late _Api api;
  late FinanceRepository finance;
  late InventoryRepository inventory;
  var online = false;
  String? user = 'user';

  setUp(() async {
    online = false;
    user = 'user';
    directory = await Directory.systemTemp.createTemp(
      'finance-inventory-offline-',
    );
    final secure = _SecureStorage();
    final secrets = <String, String>{};
    when(
      () => secure.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => secure.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: secure,
      directoryResolver: () async => directory,
    );
    queue = OfflineMutationQueue.forTesting(
      store: store,
      userId: () => user,
      checkConnectivity: () async => [
        if (online) ConnectivityResult.wifi else ConnectivityResult.none,
      ],
      connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
      authChanges: const Stream<supa.AuthState>.empty(),
    );
    await queue.init();
    api = _Api();
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException(message: 'Offline', statusCode: 0));
    finance = FinanceRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      cacheUserId: () => user,
      networkAvailable: () async => online,
    );
    inventory = InventoryRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      cacheUserId: () => user,
      networkAvailable: () async => online,
    );
  });
  tearDown(() async {
    await queue.dispose();
    await store.closeForTesting();
    await Hive.close();
    if (directory.existsSync()) directory.deleteSync(recursive: true);
  });

  Future<void> snapshot(
    String namespace,
    Object payload, {
    String source = 'page',
    String owner = 'user',
    String workspace = 'ws',
  }) => store.write(
    key: CacheKey(
      namespace: namespace,
      userId: owner,
      workspaceId: workspace,
      params: {'fixture': source},
    ),
    policy: CachePolicies.offlineCatalog,
    payload: payload,
  );

  test(
    'offline product queries preserve whole query, accents and wildcards',
    () async {
      await snapshot('inventory.products', {
        'data': [
          _product('coffee', 'Cà phê sữa', 3, description: 'Mocha beans'),
          _product('latte', 'Cafe latte', 2, description: 'Cà phê sữa'),
          _product('percent', 'Cà% phê', 1),
          _product('archived', 'Cà phê sữa', 4, archived: true),
        ],
      });
      Future<List<String>> query(String text) async =>
          (await inventory.getProducts(
            'ws',
            query: text,
          )).data.map((row) => row.id).toList();
      expect(await query('Cà phê'), ['coffee']);
      expect(await query('phê Cà'), isEmpty);
      expect(await query('Ca phe'), isEmpty);
      expect(await query('Mocha'), isEmpty);
      expect(await query('CÀ_PHÊ'), ['coffee']);
      expect(await query('Cà%phê'), ['coffee', 'percent']);
      expect(await query(r'Cà\%'), ['percent']);
      expect(
        (await inventory.getProductOptions('ws')).map((row) => row.id),
        isNot(contains('archived')),
      );
      final all = await inventory.getProducts('ws', status: 'all', pageSize: 2);
      expect(all.data.map((row) => row.id), ['archived', 'coffee']);
      expect(all.count, 4);
      expect(
        (await inventory.getProducts('ws', status: 'archived')).data.single.id,
        'archived',
      );
      expect(
        (await inventory.getProducts(
          'ws',
          status: 'all',
          page: 2,
          pageSize: 2,
        )).data.map((row) => row.id),
        ['latte', 'percent'],
      );
      verifyNever(() => api.getJson(any()));
    },
  );

  test(
    'finance search uses descriptions and excludes redacted and other scopes',
    () async {
      await snapshot('finance.infiniteTransactions', {
        'data': [
          _transaction('accent', 'Cà phê sữa', 3),
          _transaction('plain', 'Cafe latte', 2),
          _transaction('hidden', '[CONFIDENTIAL]', 1),
        ],
      });
      await snapshot('finance.infiniteTransactions', {
        'data': [_transaction('other', 'Cà phê sữa', 4)],
      }, owner: 'other');
      await snapshot('finance.infiniteTransactions', {
        'data': [_transaction('other-ws', 'Cà phê sữa', 4)],
      }, workspace: 'other');
      Future<List<String>> query(String text) async =>
          (await finance.getTransactionsInfinite(
            wsId: 'ws',
            search: text,
          )).data.map((row) => row.id).toList();
      expect(await query('cÀ%SỮA'), ['accent']);
      expect(await query('sữa Cà'), isEmpty);
      expect(await query('Ca phe'), isEmpty);
      expect(await query('CONFIDENTIAL'), isEmpty);
      final first = await finance.getTransactionsInfinite(wsId: 'ws', limit: 1);
      expect(first.data.single.id, 'accent');
      expect(first.nextCursor, 'local:accent');
      final second = await finance.getTransactionsInfinite(
        wsId: 'ws',
        limit: 1,
        cursor: first.nextCursor,
      );
      expect(second.data.single.id, 'plain');
      verifyNever(() => api.getJson(any()));
    },
  );

  test(
    'offline sales pagination merges all visited pages and detail snapshots',
    () async {
      await snapshot('inventory.sales', {
        'data': [_sale('older', 1)],
      }, source: 'page-1');
      await snapshot('inventory.sales', {
        'data': [_sale('middle', 2)],
      }, source: 'page-2');
      await snapshot('inventory.sale-detail', {
        'data': _sale('newest', 3),
      }, source: 'detail');
      final first = await inventory.getSales('ws', limit: 2);
      expect(first.data.map((row) => row.id), ['newest', 'middle']);
      expect(first.count, 3);
      expect(first.realtimeEnabled, isFalse);
      final second = await inventory.getSales('ws', limit: 2, offset: 2);
      expect(second.data.single.id, 'older');
      verifyNever(() => api.getJson(any()));
    },
  );

  test('queued finance CRUD remains editable from cached detail', () async {
    await snapshot(
      'finance.transactionDetail',
      _transaction('stored', 'Before', 1),
    );
    await finance.updateTransaction(
      wsId: 'ws',
      transactionId: 'stored',
      amount: -25,
      description: 'After',
    );
    expect(
      (await finance.getTransactionById(
        wsId: 'ws',
        transactionId: 'stored',
      ))?.description,
      'After',
    );
    final id = await finance.createTransaction(
      wsId: 'ws',
      amount: -5,
      takenAt: DateTime.utc(2026, 10, 2),
      walletId: 'wallet',
      description: 'New offline',
    );
    expect(id, isNotNull);
    expect(
      (await finance.getTransactionById(
        wsId: 'ws',
        transactionId: id!,
      ))?.description,
      'New offline',
    );
    await finance.deleteTransaction(wsId: 'ws', transactionId: 'stored');
    expect(
      await finance.getTransactionById(wsId: 'ws', transactionId: 'stored'),
      isNull,
    );
    expect((await queue.listPending()).length, 3);
    verifyNever(() => api.getJson(any()));
  });

  test(
    'offline product edits and deletion project over cached product detail',
    () async {
      await snapshot('inventory.product', _product('stored', 'Before', 1));
      await inventory.updateProduct(
        wsId: 'ws',
        productId: 'stored',
        name: 'After',
        categoryId: 'category',
        ownerId: 'owner',
        inventory: const [],
      );
      expect((await inventory.getProduct('ws', 'stored'))?.name, 'After');
      await inventory.deleteProduct(wsId: 'ws', productId: 'stored');
      expect(await inventory.getProduct('ws', 'stored'), isNull);
      expect((await queue.listPending()).length, 2);
      verifyNever(() => api.getJson(any()));
    },
  );

  test('offline sale CRUD uses the injected queue', () async {
    final id = await inventory.createSale(
      wsId: 'ws',
      walletId: 'wallet',
      content: 'Before sale',
      products: [
        {
          'product_id': 'coffee',
          'unit_id': 'unit',
          'warehouse_id': 'warehouse',
          'amount': 1,
          'price': 100,
        },
      ],
    );
    final original = await inventory.getSaleDetail('ws', id);
    expect(original.notice, 'Before sale');
    expect(original.lines.single.productId, 'coffee');
    expect(original.lines.single.quantity, 1);
    expect(original.totalQuantity, 1);
    await inventory.updateSale(
      wsId: 'ws',
      saleId: id,
      notice: 'After sale',
      previous: original,
    );
    expect((await inventory.getSaleDetail('ws', id)).notice, 'After sale');
    expect((await inventory.getSales('ws')).data.single.notice, 'After sale');
    await inventory.deleteSale('ws', id);
    expect((await inventory.getSales('ws')).data, isEmpty);
    await expectLater(
      inventory.getSaleDetail('ws', id),
      throwsA(
        isA<ApiException>().having((error) => error.statusCode, 'status', 404),
      ),
    );
    expect((await queue.listPending()).map((row) => row.feature).toSet(), {
      'inventory',
    });
    verifyNever(() => api.getJson(any()));
  });

  test(
    'scheduled draft retains cached period and submitted quantity',
    () async {
      await snapshot('inventory.sales-periods', {
        'data': [
          {
            'id': 'season',
            'name': 'Season',
            'pricing_mode': 'scheduled',
            'status': 'active',
          },
        ],
      });
      final id = await inventory.queueScheduledSale('ws', {
        'inventory_request_id': 'draft',
        'inventory_period_id': 'season',
        'price_mode': 'custom',
        'products': [
          {
            'product_id': 'coffee',
            'unit_id': 'unit',
            'warehouse_id': 'warehouse',
            'quantity': 2,
            'price': 10,
            'price_id': 'price',
          },
        ],
      });
      final detail = await inventory.getSaleDetail('ws', id);
      expect(detail.period?.isScheduled, isTrue);
      expect(detail.totalQuantity, 2);
    },
  );

  void preparationApi({String? failPath}) {
    when(() => api.getJsonList(any())).thenAnswer(
      (call) async =>
          call.positionalArguments.first == FinanceEndpoints.wallets('ws')
          ? <Map<String, dynamic>>[
              {'id': 'wallet', 'name': 'Wallet'},
            ]
          : <Map<String, dynamic>>[],
    );
    when(() => api.getJson(any())).thenAnswer((call) async {
      final path = call.positionalArguments.first as String;
      if (path == failPath) {
        throw const ApiException(message: 'Download failed', statusCode: 503);
      }
      if (path.startsWith(FinanceEndpoints.infiniteTransactions('ws'))) {
        return {
          'data': [_transaction('prepared', 'Stored finance', 1)],
          'hasMore': false,
        };
      }
      if (path == FinanceEndpoints.transaction('ws', 'prepared')) {
        return _transaction('prepared', 'Stored finance', 1);
      }
      if (path == FinanceEndpoints.wallet('ws', 'wallet')) {
        return {'id': 'wallet', 'name': 'Wallet'};
      }
      if (path == FinanceEndpoints.workspaceConfig('ws', 'DEFAULT_CURRENCY')) {
        return {'value': 'USD'};
      }
      if (path.startsWith(
        InventoryEndpoints.products(
          'ws',
          status: 'all',
          page: 1,
          pageSize: 100,
        ),
      )) {
        return {
          'data': [_product('prepared', 'Stored product', 1)],
          'count': 1,
        };
      }
      if (path == InventoryEndpoints.product('ws', 'prepared')) {
        return _product('prepared', 'Stored product', 1);
      }
      if (path == InventoryEndpoints.sales('ws', limit: 100, offset: 0)) {
        return {
          'data': [_sale('prepared', 1)],
          'count': 1,
        };
      }
      if (path == InventoryEndpoints.sale('ws', 'prepared')) {
        return {'data': _sale('prepared', 1)};
      }
      return {'data': <Map<String, dynamic>>[], 'count': 0};
    });
  }

  test(
    'finance pack persists transaction and wallet detail keys for offline read',
    () async {
      preparationApi();
      await finance.prepareOffline('ws');
      final key = CacheKey(
        namespace: 'finance.transactionDetail',
        userId: user,
        workspaceId: 'ws',
        params: {'path': FinanceEndpoints.transaction('ws', 'prepared')},
      );
      expect(
        (await store.read<Object?>(
          key: key,
          decode: (value) => value,
        )).hasValue,
        isTrue,
      );
      expect(
        (await finance.getTransactionById(
          wsId: 'ws',
          transactionId: 'prepared',
        ))?.description,
        'Stored finance',
      );
      final wallet = CacheKey(
        namespace: 'finance.walletDetail',
        userId: user,
        workspaceId: 'ws',
        params: {'path': FinanceEndpoints.wallet('ws', 'wallet')},
      );
      expect(
        (await store.read<Object?>(
          key: wallet,
          decode: (value) => value,
        )).hasValue,
        isTrue,
      );
    },
  );

  test(
    'inventory pack persists exact product and sale detail options',
    () async {
      preparationApi();
      await inventory.prepareOffline('ws');
      for (final entry in {
        'product': 'productId',
        'sale-detail': 'saleId',
      }.entries) {
        final key = CacheKey(
          namespace: 'inventory.${entry.key}',
          userId: user,
          workspaceId: 'ws',
          locale: currentCacheLocaleTag(),
          params: {entry.value: 'prepared'},
        );
        expect(
          (await store.read<Object?>(
            key: key,
            decode: (value) => value,
          )).hasValue,
          isTrue,
        );
      }
      expect(
        (await inventory.getProduct('ws', 'prepared'))?.name,
        'Stored product',
      );
      expect(
        (await inventory.getSaleDetail('ws', 'prepared')).notice,
        'Sale prepared',
      );
    },
  );

  test(
    'finance pack surfaces detail fetch failure rather than reporting complete',
    () async {
      preparationApi(failPath: FinanceEndpoints.transaction('ws', 'prepared'));
      await expectLater(
        finance.prepareOffline('ws'),
        throwsA(isA<ApiException>()),
      );
    },
  );
  test('inventory pack surfaces detail failure', () async {
    preparationApi(failPath: InventoryEndpoints.product('ws', 'prepared'));
    await expectLater(
      inventory.prepareOffline('ws'),
      throwsA(isA<ApiException>()),
    );
  });
  test(
    'explicit finance pack fails when persistent cache writes fail',
    () async {
      preparationApi();
      await store.init();
      await Hive.box<dynamic>('offline_cache_v1').close();
      await expectLater(
        finance.prepareOffline('ws'),
        throwsA(isA<HiveError>()),
      );
    },
  );
  test(
    'explicit inventory pack fails when persistent cache writes fail',
    () async {
      preparationApi();
      await store.init();
      await Hive.box<dynamic>('offline_cache_v1').close();
      await expectLater(
        inventory.prepareOffline('ws'),
        throwsA(isA<HiveError>()),
      );
    },
  );
  test('forced offline checkpoint reads retain confirmed rows', () async {
    final key = CacheKey(
      namespace: 'finance.checkpointList',
      userId: user,
      workspaceId: 'ws',
      params: const {'walletId': 'wallet', 'limit': '50'},
    );
    await store.write(
      key: key,
      policy: CachePolicies.offlineCatalog,
      payload: {
        'data': [
          {
            'id': 'checkpoint',
            'wallet_id': 'wallet',
            'checked_at': '2026-10-02T00:00:00Z',
            'created_at': '2026-10-02T00:00:00Z',
            'updated_at': '2026-10-02T00:00:00Z',
          },
        ],
        'intervals': <dynamic>[],
      },
    );
    final result = await CacheStore.awaitRevalidation(
      () => finance.getWalletCheckpoints(wsId: 'ws', walletId: 'wallet'),
    );
    expect(result.data.single.id, 'checkpoint');
  });

  for (final verification in [false, true]) {
    test(
      'checkpoint denial preserves cache only for verification=$verification',
      () async {
        final key = CacheKey(
          namespace: 'finance.checkpointSummary',
          userId: user,
          workspaceId: 'ws',
        );
        await store.write(
          key: key,
          policy: CachePolicies.offlineCatalog,
          payload: {
            'wallets': [
              {'id': 'wallet'},
            ],
          },
        );
        final denied = ApiException(
          message: 'Denied',
          statusCode: 403,
          isVerificationRequired: verification,
        );
        when(() => api.getJson(any())).thenThrow(denied);
        await expectLater(
          finance.getWalletCheckpointSummary(wsId: 'ws', forceRefresh: true),
          throwsA(same(denied)),
        );
        expect(
          (await store.read<Object>(
            key: key,
            decode: (value) => value!,
          )).hasValue,
          verification,
        );
      },
    );
  }

  test('finance download prepares first-visit summary wallet stats '
      'and global rates', () async {
    when(() => api.getJsonList(any())).thenAnswer(
      (call) async =>
          call.positionalArguments.first == FinanceEndpoints.wallets('ws')
          ? [
              {'id': 'wallet', 'currency': 'USD'},
            ]
          : <dynamic>[],
    );
    when(() => api.getJson(any())).thenAnswer((call) async {
      final path = call.positionalArguments.first as String;
      if (path == FinanceEndpoints.exchangeRates) {
        return {
          'data': [
            {'base_currency': 'USD', 'target_currency': 'VND', 'rate': 25000},
          ],
        };
      }
      if (path == FinanceEndpoints.walletCheckpointSummary('ws')) {
        return {
          'wallets': [
            {'id': 'wallet'},
          ],
        };
      }
      if (path == FinanceEndpoints.wallet('ws', 'wallet')) {
        return {'id': 'wallet'};
      }
      if (path.contains('/stats')) return {'totalTransactions': 7};
      if (path.contains('DEFAULT_CURRENCY')) return {'value': 'USD'};
      return {'data': <dynamic>[], 'hasMore': false, 'has_more': false};
    });
    await finance.prepareOffline('ws');
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException(message: 'Offline', statusCode: 0));
    final summary = await CacheStore.awaitRevalidation(
      () => finance.getWalletCheckpointSummary(wsId: 'ws'),
    );
    final stats = await CacheStore.awaitRevalidation(
      () => finance.getTransactionStats(wsId: 'ws', walletId: 'wallet'),
    );
    final rates = await CacheStore.awaitRevalidation(finance.getExchangeRates);
    expect(summary.wallets.single.id, 'wallet');
    expect(stats.totalTransactions, 7);
    expect(rates.single.rate, 25000);
  });
}
