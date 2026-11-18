import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/finance/view/finance_checkpoints_page.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/finance/view/transaction_list_page.dart';
import 'package:mobile/features/finance/view/wallet_detail_page.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/pump_app.dart';
import 'finance_scenes.dart';

class _Workspace extends Mock implements WorkspaceCubit {}

class _ScopedRepository extends FinanceSceneRepository {
  final newWallet = Completer<Wallet?>();
  final newCheckpoints = Completer<WalletCheckpointSummaryResponse>();
  final searches = <(String, FinanceTransactionQuery)>[];
  int statsReads = 0;

  @override
  Future<TransactionStats> getTransactionStats({
    required String wsId,
    String? walletId,
    String? search,
    FinanceTransactionQuery filters = const FinanceTransactionQuery(),
  }) {
    statsReads++;
    return super.getTransactionStats(
      wsId: wsId,
      walletId: walletId,
      search: search,
      filters: filters,
    );
  }

  @override
  Future<Wallet?> getWalletById({
    required String wsId,
    required String walletId,
  }) => wsId == 'scope-new'
      ? newWallet.future
      : super.getWalletById(wsId: wsId, walletId: walletId);

  @override
  Future<WalletCheckpointSummaryResponse> getWalletCheckpointSummary({
    required String wsId,
    bool forceRefresh = false,
  }) => wsId == 'scope-new'
      ? newCheckpoints.future
      : super.getWalletCheckpointSummary(
          wsId: wsId,
          forceRefresh: forceRefresh,
        );

  @override
  Future<InfiniteTransactionResponse> getTransactionsInfinite({
    required String wsId,
    int limit = 20,
    String? cursor,
    String? search,
    String? walletId,
    FinanceTransactionQuery query = const FinanceTransactionQuery(),
  }) async {
    if (search != null) searches.add((search, query));
    if (search != 'tea') {
      return await super.getTransactionsInfinite(
        wsId: wsId,
        limit: limit,
        cursor: cursor,
        search: search,
        walletId: walletId,
        query: query,
      );
    }
    return InfiniteTransactionResponse(
      data: [
        if (query.start == null)
          Transaction(
            id: 'old-tea',
            description: 'Older tea',
            amount: -35000,
            takenAt: DateTime(2024),
          ),
      ],
      hasMore: false,
    );
  }
}

void main() {
  late _Workspace workspace;
  late StreamController<WorkspaceState> changes;
  late FinancePreferencesCubit preferences;
  late ShellChromeActionsCubit chrome;
  late ShellTitleOverrideCubit titles;
  late _ScopedRepository repository;

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await CacheStore.instance.init();
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
  });

  void prepareTest() {
    workspace = _Workspace();
    changes = StreamController<WorkspaceState>.broadcast();
    const state = WorkspaceState(currentWorkspace: Workspace(id: 'scope-old'));
    when(() => workspace.state).thenReturn(state);
    when(() => workspace.stream).thenAnswer((_) => changes.stream);
    preferences = FinancePreferencesCubit(
      settingsRepository: SettingsRepository(),
    );
    chrome = ShellChromeActionsCubit();
    titles = ShellTitleOverrideCubit();
    repository = _ScopedRepository();
    addTearDown(changes.close);
    addTearDown(preferences.close);
    addTearDown(chrome.close);
    addTearDown(titles.close);
  }

  Widget wrap(Widget child) => MultiBlocProvider(
    providers: [
      BlocProvider<WorkspaceCubit>.value(value: workspace),
      BlocProvider.value(value: preferences),
      BlocProvider.value(value: chrome),
      BlocProvider.value(value: titles),
    ],
    child: child,
  );

  void switchWorkspace() {
    const state = WorkspaceState(currentWorkspace: Workspace(id: 'scope-new'));
    when(() => workspace.state).thenReturn(state);
    changes.add(state);
  }

  testWidgets('overview search finds older transactions and resets on switch', (
    tester,
  ) async {
    prepareTest();
    final router = GoRouter(
      initialLocation: Routes.finance,
      routes: [
        GoRoute(
          path: Routes.finance,
          builder: (context, state) => FinancePage(repository: repository),
        ),
        GoRoute(
          path: Routes.transactions,
          builder: (context, state) => TransactionListPage(
            startInSearch: state.uri.queryParameters['search'] == '1',
            repository: repository,
            now: financeSceneDate,
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpAppRouter(router, wrap: wrap);
    await tester.pumpAndSettle();
    chrome.state
        .resolveForLocation(Routes.finance)
        .singleWhere((action) => action.tooltip == 'Search')
        .onPressed!();
    await tester.pumpAndSettle();

    final actions = chrome.state.resolveForLocation(Routes.transactions);
    final search = actions.singleWhere(
      (action) => action.searchController != null,
    );
    expect(find.text('All time'), findsOneWidget);
    search.searchController!.text = 'tea';
    search.onSearchChanged!('tea');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(repository.searches.single, (
      'tea',
      const FinanceTransactionQuery(),
    ));
    await pumpFinanceUntilVisible(tester, find.text('Older tea'));

    switchWorkspace();
    await tester.pumpAndSettle();
    expect(search.searchController!.text, isEmpty);
    expect(find.text('Older tea'), findsNothing);
    expect(
      chrome.state
          .resolveForLocation(Routes.transactions)
          .any((action) => action.searchController != null),
      isFalse,
    );
  });

  testWidgets('closing an unchanged detail leaves overview totals alone', (
    tester,
  ) async {
    prepareTest();
    await tester.pumpThemedHome(
      FinancePage(repository: repository),
      wrap: wrap,
    );
    await tester.pumpAndSettle();
    final before = repository.statsReads;
    expect(before, greaterThan(0));
    final row = find.text('Market groceries');
    await tester.ensureVisible(row);
    await tester.tap(row);
    await tester.pumpAndSettle();
    final heading = find.text('Transaction details');
    expect(heading, findsOneWidget);
    unawaited(Navigator.of(tester.element(heading)).maybePop());
    await tester.pumpAndSettle();
    expect(heading, findsNothing);
    expect(repository.statsReads, before);
  });

  testWidgets('wallet detail removes the previous workspace before loading', (
    tester,
  ) async {
    prepareTest();
    await tester.pumpThemedHome(
      WalletDetailPage(walletId: 'wallet-vnd', repository: repository),
      wrap: wrap,
    );
    await tester.pumpAndSettle();
    expect(find.text('Everyday'), findsWidgets);
    switchWorkspace();
    await tester.pump();
    await tester.pump();
    expect(find.text('Everyday'), findsNothing);

    repository.newWallet.complete(
      const Wallet(id: 'wallet-vnd', name: 'New wallet', currency: 'VND'),
    );
    await tester.pumpAndSettle();
    expect(
      titles.state.resolveForLocation(Routes.walletDetailPath('wallet-vnd')),
      'New wallet',
    );
  });

  testWidgets('checkpoints discard the previous workspace and selection', (
    tester,
  ) async {
    prepareTest();
    await tester.pumpThemedHome(
      FinanceCheckpointsPage(
        initialWalletId: 'wallet-vnd',
        repository: repository,
      ),
      wrap: wrap,
    );
    await tester.pumpAndSettle();
    expect(find.text('Everyday'), findsWidgets);
    switchWorkspace();
    await tester.pump();
    await tester.pump();
    expect(find.text('Everyday'), findsNothing);

    repository.newCheckpoints.complete(
      const WalletCheckpointSummaryResponse(
        wallets: [
          Wallet(id: 'new-wallet', name: 'New wallet', currency: 'VND'),
        ],
        latestCheckpoints: [],
        totalsByCurrency: [],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('New wallet'), findsWidgets);
    expect(find.text('Everyday'), findsNothing);
  });
}
