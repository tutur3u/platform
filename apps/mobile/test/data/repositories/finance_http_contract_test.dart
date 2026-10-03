import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _AuthClient extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

// Response shapes follow packages/apis/src/finance handlers, not ApiClient mocks.
const _ws = '11111111-1111-4111-8111-111111111111';
const _wallet = '22222222-2222-4222-8222-222222222222';
const _category = '33333333-3333-4333-8333-333333333333';
const _tag = '44444444-4444-4444-8444-444444444444';
const _transaction = '55555555-5555-4555-8555-555555555555';
const _checkpoint = '66666666-6666-4666-8666-666666666666';
const _walletPath = '/api/workspaces/$_ws/wallets';
const _transactionPath = '/api/workspaces/$_ws/transactions';
final _checkedAt = DateTime(2026, 10, 3, 9, 30);
final _checkpointRow = <String, dynamic>{
  'id': _checkpoint,
  'wallet_id': _wallet,
  'actual_balance': 120,
  'ledger_balance': 100,
  'current_ledger_balance': 100,
  'original_variance': 20,
  'current_variance': 20,
  'currency': 'USD',
  'checked_at': '2026-10-03T02:30:00Z',
  'created_at': '2026-10-03T02:30:00Z',
  'updated_at': '2026-10-03T02:30:00Z',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FinanceRepository repository;
  late OfflineMutationQueue queue;
  late ApiClient api;
  late Future<http.Response> Function(http.Request) respond;
  late List<http.Request> requests;

  setUp(() async {
    await CacheStore.instance.clearScope();
    requests = [];
    respond = (_) async => throw StateError('Unexpected finance HTTP request');
    final authClient = _AuthClient();
    final auth = _Auth();
    final session = _Session();
    when(() => authClient.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(
      const User(
        id: 'synthetic-finance-user',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01',
      ),
    );
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('synthetic-finance-token');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    api = ApiClient(
      baseUrl: 'https://finance.example.test',
      authClient: authClient,
      httpClient: MockClient((request) async {
        expect(
          request.headers['authorization'],
          'Bearer synthetic-finance-token',
        );
        expect(request.url.host, 'finance.example.test');
        requests.add(request);
        return await respond(request);
      }),
    );
    queue = OfflineMutationQueue.forTesting(
      store: CacheStore.instance,
      userId: () => 'synthetic-finance-user',
      checkConnectivity: () async => [ConnectivityResult.wifi],
      connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
      authChanges: const Stream<AuthState>.empty(),
      apiFactory: (_) => api,
    );
    repository = FinanceRepository(
      apiClient: api,
      mutationQueue: queue,
      cacheUserId: () => 'synthetic-finance-user',
      networkAvailable: () async => true,
    );
  });
  tearDown(() async {
    await queue.dispose();
    api.dispose();
    debugClearFinanceRepositoryWorkspaceCurrencyCache();
  });

  http.Response json(Object value, [int status = 200]) => http.Response(
    jsonEncode(value),
    status,
    headers: {'content-type': 'application/json'},
  );
  Map<String, dynamic> body(http.Request request) {
    expect(request.headers['content-type'], contains('application/json'));
    return jsonDecode(request.body) as Map<String, dynamic>;
  }

  test('wallet list and detail decode raw server JSON', () async {
    final row = {
      'id': _wallet,
      'name': 'Cash',
      'currency': 'USD',
      'balance': 12.5,
    };
    respond = (request) async {
      expect(request.method, 'GET');
      return json(request.url.path == _walletPath ? [row] : row);
    };
    expect((await repository.getWallets(_ws)).single.balance, 12.5);
    expect(
      (await repository.getWalletById(wsId: _ws, walletId: _wallet))!.name,
      'Cash',
    );
    expect(requests.map((r) => r.url.path), [
      _walletPath,
      '$_walletPath/$_wallet',
    ]);
  });

  test(
    'wallet create sends stable UUID through durable HTTP dispatch',
    () async {
      respond = (request) async {
        expect(request.method, 'POST');
        expect(request.url.path, _walletPath);
        final payload = body(request);
        expect(
          payload['id'],
          matches(
            RegExp(
              '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-'
              r'[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            ),
          ),
        );
        expect(payload['type'], 'CREDIT');
        expect(payload['limit'], 1000);
        expect(payload['statement_date'], 10);
        expect(payload['payment_date'], 20);
        return json({'message': 'success'});
      };
      await repository.createWallet(
        wsId: _ws,
        name: 'Credit',
        type: 'CREDIT',
        currency: 'USD',
        limit: 1000,
        statementDate: 10,
        paymentDate: 20,
      );
      expect(requests, hasLength(1));
      expect(await queue.listPending(), isEmpty);
    },
  );

  test(
    'wallet update and deletion accept message-only acknowledgements',
    () async {
      respond = (request) async {
        expect(request.url.path, '$_walletPath/$_wallet');
        if (request.method == 'PUT') expect(body(request)['name'], 'Savings');
        return json({'message': 'success'});
      };
      await repository.updateWallet(
        wsId: _ws,
        walletId: _wallet,
        name: 'Savings',
        type: 'STANDARD',
        currency: 'USD',
      );
      await repository.deleteWallet(wsId: _ws, walletId: _wallet);
      expect(requests.map((r) => r.method), ['PUT', 'DELETE']);
    },
  );

  test('categories and tags decode raw arrays with aggregate fields', () async {
    respond = (request) async => json([
      {
        'id': request.url.path.endsWith('/tags') ? _tag : _category,
        'name': 'Travel',
        'color': '#123456',
        'is_expense': true,
        'amount': 2.5,
        'transaction_count': 2,
      },
    ]);
    expect((await repository.getCategories(_ws)).single.isExpense, isTrue);
    expect((await repository.getTags(_ws)).single.transactionCount, 2);
    expect(requests.map((r) => r.url.path), [
      '$_transactionPath/categories',
      '/api/workspaces/$_ws/tags',
    ]);
  });

  test(
    'category CRUD uses explicit offline-create contract and legacy update/delete',
    () async {
      respond = (request) async {
        if (request.method != 'DELETE') {
          final payload = body(request);
          final category = request.method == 'POST'
              ? payload['payload'] as Map
              : payload;
          expect(category['is_expense'], true);
          expect(category['name'], 'Travel');
        }
        return request.method == 'POST'
            ? json({
                'contract': 'inventory-offline-create-v1',
                'resource': 'finance_category',
                'data': {'id': _category},
              })
            : json({'message': 'success'});
      };
      await repository.createCategory(
        wsId: _ws,
        name: 'Travel',
        isExpense: true,
      );
      await repository.updateCategory(
        wsId: _ws,
        categoryId: _category,
        name: 'Travel',
        isExpense: true,
      );
      await repository.deleteCategory(wsId: _ws, categoryId: _category);
      expect(requests.map((r) => r.method), ['POST', 'PUT', 'DELETE']);
      expect(
        requests.first.url.path,
        '/api/v1/workspaces/$_ws/inventory/offline-mutations',
      );
      expect(requests.last.url.path, '$_transactionPath/categories/$_category');
    },
  );

  test(
    'tag CRUD accepts object create and message-only update/delete',
    () async {
      respond = (request) async {
        if (request.method != 'DELETE') {
          expect(body(request)['color'], '#123456');
        }
        return json(
          request.method == 'POST'
              ? {'id': _tag, 'name': 'Travel'}
              : {'message': 'success'},
        );
      };
      await repository.createTag(wsId: _ws, name: 'Travel', color: '#123456');
      await repository.updateTag(
        wsId: _ws,
        tagId: _tag,
        name: 'Travel',
        color: '#123456',
      );
      await repository.deleteTag(wsId: _ws, tagId: _tag);
      expect(requests.map((r) => r.method), ['POST', 'PUT', 'DELETE']);
      expect(requests.last.url.path, '/api/workspaces/$_ws/tags/$_tag');
    },
  );

  test(
    'transaction create parses receipt and preserves idempotency and UTC date',
    () async {
      respond = (request) async {
        expect(request.url.path, _transactionPath);
        final payload = body(request);
        expect(
          payload['client_transaction_id'],
          matches(
            RegExp(
              '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-'
              r'[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            ),
          ),
        );
        expect(payload['origin_wallet_id'], _wallet);
        expect(payload['taken_at'], _checkedAt.toUtc().toIso8601String());
        expect(payload['tag_ids'], [_tag]);
        return json({'message': 'success', 'transaction_id': _transaction});
      };
      expect(
        await repository.createTransaction(
          wsId: _ws,
          walletId: _wallet,
          amount: -12,
          takenAt: _checkedAt,
          categoryId: _category,
          tagIds: [_tag],
        ),
        _transaction,
      );
      expect(requests, hasLength(1));
    },
  );

  test(
    'transaction update refreshes raw detail, then deletion uses same scope',
    () async {
      respond = (request) async {
        expect(request.url.path, '$_transactionPath/$_transaction');
        if (request.method == 'GET') {
          return json({
            'id': _transaction,
            'amount': -15,
            'wallet_id': _wallet,
          });
        }
        if (request.method == 'PUT') {
          expect(body(request)['origin_wallet_id'], _wallet);
          expect(body(request)['tag_ids'], isEmpty);
        }
        return json({'message': 'success'});
      };
      final updated = await repository.updateTransaction(
        wsId: _ws,
        transactionId: _transaction,
        amount: -15,
        walletId: _wallet,
        tagIds: [],
      );
      expect(updated.amount, -15);
      await repository.deleteTransaction(
        wsId: _ws,
        transactionId: _transaction,
      );
      expect(requests.map((r) => r.method), ['PUT', 'GET', 'DELETE']);
    },
  );

  test('transfer creation preserves both stable IDs and receipt', () async {
    respond = (request) async {
      expect(request.url.path, '/api/workspaces/$_ws/transfers');
      final payload = body(request);
      expect(
        payload['client_origin_transaction_id'],
        isNot(payload['client_destination_transaction_id']),
      );
      expect(payload['destination_wallet_id'], _category);
      return json({'from_transaction_id': _transaction});
    };
    expect(
      await repository.createTransfer(
        wsId: _ws,
        originWalletId: _wallet,
        destinationWalletId: _category,
        amount: 10,
        takenAt: _checkedAt,
      ),
      _transaction,
    );
  });

  test(
    'transaction page and stats preserve encoded filters and server envelopes',
    () async {
      respond = (request) async {
        expect(request.url.queryParameters['q'], 'rent & food');
        expect(request.url.queryParameters['walletId'], _wallet);
        if (request.url.path.endsWith('/stats')) {
          return json({
            'totalTransactions': 1,
            'totalIncome': 0,
            'totalExpense': 12,
            'netTotal': -12,
            'currency': 'USD',
          });
        }
        expect(request.url.queryParameters['cursor'], '2026-10-01:previous');
        return json({
          'data': [
            {'id': _transaction, 'amount': -12},
          ],
          'hasMore': true,
          'nextCursor': '2026-09-30:next',
        });
      };
      final page = await repository.getTransactionsInfinite(
        wsId: _ws,
        search: 'rent & food',
        walletId: _wallet,
        cursor: '2026-10-01:previous',
      );
      expect(page.data.single.id, _transaction);
      expect(page.nextCursor, '2026-09-30:next');
      expect(page.hasMore, isTrue);
      final stats = await repository.getTransactionStats(
        wsId: _ws,
        search: 'rent & food',
        walletId: _wallet,
      );
      expect(stats.totalExpense, 12);
      expect(stats.totalTransactions, 1);
    },
  );

  test(
    'checkpoint list decodes enriched list rather than a bare array',
    () async {
      respond = (request) async {
        expect(request.url.path, '$_walletPath/$_wallet/checkpoints');
        expect(request.url.queryParameters['limit'], '25');
        return json({
          'data': [_checkpointRow],
          'intervals': <Object>[],
          'latest': _checkpointRow,
        });
      };
      final result = await repository.getWalletCheckpoints(
        wsId: _ws,
        walletId: _wallet,
        limit: 25,
        forceRefresh: true,
      );
      expect(result.data.single.currentVariance, 20);
      expect(result.latest!.id, _checkpoint);
    },
  );

  test(
    'checkpoint reconciliation receipt and deletion acknowledgement',
    () async {
      respond = (request) async {
        if (request.method == 'DELETE') {
          expect(
            request.url.path,
            '$_walletPath/$_wallet/checkpoints/$_checkpoint',
          );
          return json({'message': 'success'});
        }
        expect(
          request.url.path,
          '$_walletPath/$_wallet/checkpoints/$_checkpoint/reconcile',
        );
        expect(body(request)['basis'], 'checkpoint');
        return json({
          'checkpoint_id': _checkpoint,
          'wallet_id': _wallet,
          'checked_at': '2026-10-03T02:30:00Z',
          'created': true,
          'offset_amount': 20,
          'transaction_id': _transaction,
        });
      };
      final receipt = await repository.reconcileWalletCheckpoint(
        wsId: _ws,
        walletId: _wallet,
        checkpointId: _checkpoint,
        basis: 'checkpoint',
      );
      expect(receipt.transactionId, _transaction);
      expect(receipt.offsetAmount, 20);
      await repository.deleteWalletCheckpoint(
        wsId: _ws,
        walletId: _wallet,
        checkpointId: _checkpoint,
      );
      expect(requests.map((r) => r.method), ['POST', 'DELETE']);
    },
  );

  for (final operation in ['create', 'update', 'batch']) {
    test(
      'checkpoint $operation sends unambiguous UTC instant to server parser',
      () async {
        respond = (request) async {
          return json(
            operation == 'batch'
                ? {
                    'data': [_checkpointRow],
                    'totals_by_currency': <Object>[],
                  }
                : _checkpointRow,
          );
        };
        if (operation == 'create') {
          expect(
            (await repository.createWalletCheckpoint(
              wsId: _ws,
              walletId: _wallet,
              actualBalance: 120,
              checkedAt: _checkedAt,
            )).id,
            _checkpoint,
          );
        } else if (operation == 'update') {
          expect(
            (await repository.updateWalletCheckpoint(
              wsId: _ws,
              walletId: _wallet,
              checkpointId: _checkpoint,
              actualBalance: 120,
              checkedAt: _checkedAt,
            )).id,
            _checkpoint,
          );
        } else {
          final batch = await repository.createWalletCheckpointBatch(
            wsId: _ws,
            checkedAt: _checkedAt,
            entries: const [
              WalletCheckpointBatchEntry(walletId: _wallet, actualBalance: 120),
            ],
          );
          expect(batch.data.single.id, _checkpoint);
        }
        expect(
          requests.single.method,
          operation == 'update' ? 'PATCH' : 'POST',
        );
        expect(
          requests.single.url.path,
          operation == 'batch'
              ? '$_walletPath/checkpoints'
              : '$_walletPath/$_wallet/checkpoints${operation == 'update' ? '/$_checkpoint' : ''}',
        );
        expect(
          body(requests.single)['checked_at'],
          _checkedAt.toUtc().toIso8601String(),
        );
      },
    );
  }

  for (final status in [400, 403, 422]) {
    test(
      'Finance $status validation/permission errors do not become offline success',
      () async {
        respond = (_) async => json({'message': 'Synthetic rejection'}, status);
        await expectLater(
          repository.createTransaction(
            wsId: _ws,
            walletId: _wallet,
            amount: -12,
            takenAt: _checkedAt,
          ),
          throwsA(
            isA<ApiException>().having((e) => e.statusCode, 'status', status),
          ),
        );
        expect(requests, hasLength(1));
        expect(await queue.listPending(), isEmpty);
      },
    );
  }
}
