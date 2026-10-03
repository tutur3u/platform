import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Secure extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

Map<String, dynamic> _transaction(String id, int day) => {
  'id': id,
  'wallet_id': 'wallet',
  'description': id,
  'amount': -10,
  'taken_at': '2026-10-${day.toString().padLeft(2, '0')}T00:00:00Z',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late OfflineMutationQueue queue;
  late _Api api;
  late FinanceRepository repo;
  var online = false;
  String? user = 'actor';
  setUp(() async {
    user = 'actor';
    online = false;
    directory = await Directory.systemTemp.createTemp('finance-review-');
    final secure = _Secure();
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
    when(
      () => api.getJsonList(any()),
    ).thenThrow(const ApiException(message: 'Offline', statusCode: 0));
    repo = FinanceRepository(
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
    directory.deleteSync(recursive: true);
  });

  CacheKey key(String namespace, String path) => CacheKey(
    namespace: 'finance.$namespace',
    userId: user,
    workspaceId: 'ws',
    params: {'path': path},
  );
  Future<void> snapshot(String namespace, String path, Object payload) =>
      store.write(
        key: key(namespace, path),
        policy: CachePolicies.offlineCatalog,
        payload: payload,
      );

  test(
    'offline uncached taxonomy revalidation propagates transport failure',
    () async {
      await expectLater(
        CacheStore.awaitRevalidation(() => repo.getCategories('ws')),
        throwsA(isA<ApiException>()),
      );
      await expectLater(
        CacheStore.awaitRevalidation(() => repo.getTags('ws')),
        throwsA(isA<ApiException>()),
      );
    },
  );

  test('injected queue exposes and removes optimistic checkpoints', () async {
    final created = await repo.createWalletCheckpoint(
      wsId: 'ws',
      walletId: 'wallet',
      actualBalance: 20,
      checkedAt: DateTime.utc(2026, 10, 2),
    );
    final pending = await repo.getWalletCheckpoints(
      wsId: 'ws',
      walletId: 'wallet',
    );
    expect(pending.data.single.id, created.id);
    await repo.deleteWalletCheckpoint(
      wsId: 'ws',
      walletId: 'wallet',
      checkpointId: created.id,
    );
    expect(
      (await repo.getWalletCheckpoints(wsId: 'ws', walletId: 'wallet')).data,
      isEmpty,
    );
  });

  test(
    'an attachment mutation does not hide an online transaction detail',
    () async {
      await queue.enqueueIfOffline(
        feature: 'finance',
        method: 'POST',
        path:
            '${FinanceEndpoints.transaction('ws', 'transaction')}/attachments',
        workspaceId: 'ws',
        entityId: 'transaction',
        payload: {'name': 'file'},
      );
      online = true;
      when(
        () => api.getJson(FinanceEndpoints.transaction('ws', 'transaction')),
      ).thenAnswer((_) async => _transaction('transaction', 2));
      expect(
        (await repo.getTransactionById(
          wsId: 'ws',
          transactionId: 'transaction',
        ))?.id,
        'transaction',
      );
      verify(
        () => api.getJson(FinanceEndpoints.transaction('ws', 'transaction')),
      ).called(1);
    },
  );

  test('server 404 evicts a retained transaction detail', () async {
    final path = FinanceEndpoints.transaction('ws', 'deleted');
    await snapshot('transactionDetail', path, _transaction('deleted', 1));
    online = true;
    when(
      () => api.getJson(path),
    ).thenThrow(const ApiException(message: 'Deleted', statusCode: 404));
    expect(
      await repo.getTransactionById(wsId: 'ws', transactionId: 'deleted'),
      isNull,
    );
    expect(
      (await store.read<Object?>(
        key: key('transactionDetail', path),
        decode: (value) => value,
      )).hasValue,
      isFalse,
    );
  });

  test('wallet 404 retains only an optimistic wallet mutation', () async {
    await repo.createWallet(
      wsId: 'ws',
      name: 'Queued',
      type: 'STANDARD',
      currency: 'USD',
    );
    final walletId = (await queue.listPending()).single.entityId!;
    online = true;
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException(message: 'Not replayed', statusCode: 404));
    expect(
      (await repo.getWalletById(wsId: 'ws', walletId: walletId))?.name,
      'Queued',
    );
    await snapshot('wallets', FinanceEndpoints.wallets('ws'), [
      {'id': 'deleted', 'name': 'Deleted'},
    ]);
    expect(await repo.getWalletById(wsId: 'ws', walletId: 'deleted'), isNull);
  });

  test(
    'server cursor resumes cached continuation after going offline',
    () async {
      await snapshot('infiniteTransactions', 'previous-pages', {
        'data': [_transaction('new', 2), _transaction('old', 1)],
      });
      online = true;
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'data': [_transaction('new', 2)],
          'hasMore': true,
          'nextCursor': 'server-cursor',
        },
      );
      final first = await repo.getTransactionsInfinite(
        wsId: 'ws',
        limit: 1,
        walletId: 'wallet',
      );
      expect(first.nextCursor, 'server-cursor');
      online = false;
      final next = await repo.getTransactionsInfinite(
        wsId: 'ws',
        limit: 1,
        walletId: 'wallet',
        cursor: first.nextCursor,
      );
      expect(next.data.single.id, 'old');
      expect(
        (await repo.getTransactionsInfinite(
          wsId: 'ws',
          limit: 1,
          walletId: 'other',
          cursor: first.nextCursor,
        )).data,
        isEmpty,
      );
    },
  );

  void prepareApi({bool failDetail = false, bool huge = false}) {
    when(() => api.getJsonList(any())).thenAnswer((call) async {
      final path = call.positionalArguments.first as String;
      if (path == FinanceEndpoints.wallets('ws')) {
        return [
          {'id': 'wallet', 'name': 'New'},
        ];
      }
      if (huge && path == FinanceEndpoints.categories('ws')) {
        return [
          {'id': 'huge', 'name': 'x' * (32 * 1024 * 1024)},
        ];
      }
      return [];
    });
    when(() => api.getJson(any())).thenAnswer((call) async {
      final path = call.positionalArguments.first as String;
      if (path == FinanceEndpoints.transaction('ws', 'new')) {
        if (failDetail) {
          throw const ApiException(message: 'Late failure', statusCode: 503);
        }
        return _transaction('new', 2);
      }
      if (path.startsWith(FinanceEndpoints.infiniteTransactions('ws'))) {
        return {
          'data': [_transaction('new', 2)],
          'hasMore': false,
        };
      }
      if (path == FinanceEndpoints.wallet('ws', 'wallet')) {
        return {'id': 'wallet', 'name': 'New'};
      }
      if (path.contains('DEFAULT_CURRENCY')) return {'value': 'USD'};
      return {'data': <dynamic>[]};
    });
  }

  for (final huge in [false, true]) {
    test(
      'failed staged download preserves existing keys (bound=$huge)',
      () async {
        final path = FinanceEndpoints.wallets('ws');
        await snapshot('wallets', path, [
          {'id': 'old', 'name': 'Retained'},
        ]);
        prepareApi(failDetail: !huge, huge: huge);
        await expectLater(
          repo.prepareOffline('ws'),
          huge ? throwsStateError : throwsA(isA<ApiException>()),
        );
        final retained = await store.read<List<dynamic>>(
          key: key('wallets', path),
          decode: (value) => List<dynamic>.from(value! as List),
        );
        expect((retained.data!.single as Map)['id'], 'old');
      },
    );
  }
}
