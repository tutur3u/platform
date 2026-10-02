import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements FinanceRepository {}

class _Store extends Mock implements CacheStore {
  Future<void> Function(CacheKey key)? beforeRead;
  final writes = <CacheKey>[];
  final snapshots = <String, Object?>{};

  @override
  Future<CacheReadResult<T>> read<T>({
    required CacheKey key,
    required CacheJsonDecoder<T> decode,
  }) async {
    await beforeRead?.call(key);
    final payload = snapshots[key.value];
    return payload == null
        ? const CacheReadResult(state: CacheEntryState.missing)
        : CacheReadResult(
            state: CacheEntryState.fresh,
            data: decode(payload),
            hasValue: true,
          );
  }

  @override
  Future<void> write({
    required CacheKey key,
    required CachePolicy policy,
    required Object? payload,
    String? etag,
    List<String> tags = const <String>[],
    int? expectedRevision,
  }) async {
    writes.add(key);
    snapshots[key.value] = payload;
  }
}

InfiniteTransactionResponse _page(String id, {bool hasMore = false}) =>
    InfiniteTransactionResponse(
      data: [Transaction(id: id, description: id, amount: 1)],
      hasMore: hasMore,
      nextCursor: hasMore ? id : null,
    );

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Repository repo;
  late _Store store;
  String? user;

  setUp(() {
    repo = _Repository();
    store = _Store();
    user = 'actor';
    FinanceCubit.clearUserCache(null);
    when(() => repo.getExchangeRates()).thenAnswer((_) async => const []);
    when(
      () => repo.getWorkspaceDefaultCurrency(any()),
    ).thenAnswer((_) async => 'USD');
    when(() => repo.getWallets(any())).thenAnswer((_) async => const []);
    when(
      () => repo.getTransactionsInfinite(
        wsId: any(named: 'wsId'),
        limit: any(named: 'limit'),
        search: any(named: 'search'),
        cursor: any(named: 'cursor'),
      ),
    ).thenAnswer((_) async => _page('default'));
  });

  FinanceCubit finance() => FinanceCubit(
    financeRepository: repo,
    cacheStore: store,
    currentUserId: () => user,
  );
  TransactionListCubit transactions() => TransactionListCubit(
    financeRepository: repo,
    cacheStore: store,
    currentUserId: () => user,
  );

  test('finance discards an old workspace success and cache write', () async {
    final delayed = Completer<List<Wallet>>();
    when(() => repo.getWallets('old')).thenAnswer((_) => delayed.future);
    final cubit = finance();
    addTearDown(cubit.close);
    final old = cubit.loadFinanceData('old');
    await _settle();
    await cubit.loadFinanceData('new');
    delayed.complete(const [Wallet(id: 'old-wallet', name: 'Old')]);
    await old;
    expect(cubit.state.wallets, isEmpty);
    expect(store.writes.map((key) => key.workspaceId), ['new']);
  });

  test(
    'finance discards an old actor and clears visible data immediately',
    () async {
      when(() => repo.getWallets('same')).thenAnswer(
        (_) async => const [Wallet(id: 'private-wallet', name: 'Private')],
      );
      final cubit = finance();
      addTearDown(cubit.close);
      await cubit.loadFinanceData('same');
      final delayed = Completer<List<Wallet>>();
      when(() => repo.getWallets('same')).thenAnswer((_) => delayed.future);
      final old = cubit.loadFinanceData('same', forceRefresh: true);
      await _settle();
      user = 'other';
      when(() => repo.getWallets('same')).thenAnswer((_) async => const []);
      final next = cubit.loadFinanceData('same');
      expect(cubit.state.wallets, isEmpty);
      await next;
      delayed.complete(const [Wallet(id: 'stale-wallet', name: 'Stale')]);
      await old;
      expect(cubit.state.wallets, isEmpty);
      expect(store.writes.map((key) => key.userId), ['actor', 'other']);
    },
  );

  test('finance ignores failure after close without writing', () async {
    final delayed = Completer<List<Wallet>>();
    when(() => repo.getWallets('closed')).thenAnswer((_) => delayed.future);
    final cubit = finance();
    final pending = cubit.loadFinanceData('closed');
    await _settle();
    await cubit.close();
    delayed.completeError(Exception('late'));
    await pending;
    expect(store.writes, isEmpty);
  });

  test('transaction search discards old query results and writes', () async {
    final cubit = transactions();
    addTearDown(cubit.close);
    await cubit.load('search-scope');
    store.writes.clear();
    final delayed = Completer<InfiniteTransactionResponse>();
    when(
      () => repo.getTransactionsInfinite(wsId: 'search-scope', search: 'old'),
    ).thenAnswer((_) => delayed.future);
    final old = cubit.setSearch('old');
    await _settle();
    await cubit.setSearch('new');
    delayed.complete(_page('old-private-result'));
    await old;
    expect(cubit.state.search, 'new');
    expect(cubit.state.transactions.single.id, 'default');
    expect(store.writes, hasLength(1));
    expect(store.writes.single.params, {'search': 'new'});
  });

  test('transaction workspace change discards old metadata failure', () async {
    final delayed = Completer<String>();
    when(
      () => repo.getWorkspaceDefaultCurrency('old-metadata'),
    ).thenAnswer((_) => delayed.future);
    final cubit = transactions();
    addTearDown(cubit.close);
    final old = cubit.load('old-metadata');
    await _settle();
    await cubit.load('new-metadata');
    delayed.completeError(Exception('old failure'));
    await old;
    expect(cubit.state.status, TransactionListStatus.loaded);
    expect(cubit.state.error, isNull);
    expect(store.writes.map((key) => key.workspaceId), ['new-metadata']);
  });

  test('old disk read cannot revive a superseded workspace', () async {
    final delayed = Completer<void>();
    store.beforeRead = (key) async {
      if (key.workspaceId == 'slow-disk') await delayed.future;
    };
    final cubit = transactions();
    addTearDown(cubit.close);
    final old = cubit.load('slow-disk');
    await _settle();
    await cubit.load('fast-disk');
    delayed.complete();
    await old;
    expect(store.writes.map((key) => key.workspaceId), ['fast-disk']);
    verifyNever(() => repo.getWorkspaceDefaultCurrency('slow-disk'));
  });

  test('pending pagination is superseded by a new search', () async {
    when(
      () => repo.getTransactionsInfinite(wsId: 'pagination-search'),
    ).thenAnswer((_) async => _page('first', hasMore: true));
    final cubit = transactions();
    addTearDown(cubit.close);
    await cubit.load('pagination-search');
    store.writes.clear();
    final delayed = Completer<InfiniteTransactionResponse>();
    when(
      () => repo.getTransactionsInfinite(
        wsId: 'pagination-search',
        cursor: 'first',
      ),
    ).thenAnswer((_) => delayed.future);
    final more = cubit.loadMore();
    await _settle();
    await cubit.setSearch('replacement');
    delayed.complete(_page('stale-page'));
    await more;
    expect(cubit.state.transactions.map((row) => row.id), ['default']);
    expect(cubit.state.search, 'replacement');
    expect(store.writes.single.params, {'search': 'replacement'});
  });

  test('transaction actor changes discard pending results', () async {
    final delayed = Completer<InfiniteTransactionResponse>();
    when(
      () => repo.getTransactionsInfinite(wsId: 'actor-change'),
    ).thenAnswer((_) => delayed.future);
    final cubit = transactions();
    addTearDown(cubit.close);
    final pending = cubit.load('actor-change');
    await _settle();
    user = 'other';
    delayed.complete(_page('private'));
    await pending;
    expect(cubit.state.transactions, isEmpty);
    expect(store.writes, isEmpty);
  });

  test('transaction pagination completion after close is ignored', () async {
    when(
      () => repo.getTransactionsInfinite(wsId: 'closed-page'),
    ).thenAnswer((_) async => _page('first', hasMore: true));
    final cubit = transactions();
    await cubit.load('closed-page');
    store.writes.clear();
    final delayed = Completer<InfiniteTransactionResponse>();
    when(
      () => repo.getTransactionsInfinite(wsId: 'closed-page', cursor: 'first'),
    ).thenAnswer((_) => delayed.future);
    final more = cubit.loadMore();
    await _settle();
    await cubit.close();
    delayed.complete(_page('second'));
    await more;
    expect(cubit.state.transactions.map((row) => row.id), ['first']);
    expect(store.writes, isEmpty);
  });
}
