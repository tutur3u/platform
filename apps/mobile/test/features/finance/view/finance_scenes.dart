import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/tag.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/finance_module.dart';
import 'package:mobile/features/finance/utils/finance_flow.dart';
import 'package:mobile/features/finance/view/budgets_page.dart';
import 'package:mobile/features/finance/view/debts_page.dart';
import 'package:mobile/features/finance/view/finance_analytics_page.dart';
import 'package:mobile/features/finance/view/finance_checkpoints_page.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/finance/view/transaction_categories_page.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';
import 'package:mobile/features/finance/view/transaction_list_body.dart';
import 'package:mobile/features/finance/view/wallet_detail_page.dart';
import 'package:mobile/features/finance/view/wallets_page.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';

import 'finance_analytics_fixtures.dart';
import 'finance_debt_fixtures.dart';

/// Waits for views that finish publishing their cache on real disk I/O.
Future<void> pumpFinanceUntilVisible(WidgetTester tester, Finder target) async {
  final deadline = DateTime.now().add(const Duration(seconds: 5));
  while (target.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump(const Duration(milliseconds: 16));
  }
  expect(target, findsWidgets);
}

const _sceneWorkspaceId = 'fixture-finance';

Future<void> seedFinanceSceneCache() async {
  final repository = FinanceSceneRepository();
  final categories = await repository.getCategories(_sceneWorkspaceId);
  final snapshots = {
    'finance.wallets': _wallets.map((wallet) => wallet.toJson()).toList(),
    'finance.categories': categories
        .map((category) => category.toJson())
        .toList(),
  };
  for (final MapEntry(key: namespace, value: payload) in snapshots.entries) {
    await CacheStore.instance.write(
      key: CacheKey(
        namespace: namespace,
        userId: currentCacheUserId(),
        workspaceId: _sceneWorkspaceId,
        locale: currentCacheLocaleTag(),
      ),
      policy: CachePolicies.moduleData,
      payload: payload,
    );
  }
}

final financeSceneDate = DateTime(2026, 11, 18, 9, 30);

const _wallets = [
  Wallet(id: 'wallet-vnd', name: 'Everyday', balance: 1250000, currency: 'VND'),
  Wallet(id: 'wallet-usd', name: 'Savings', balance: 1240, currency: 'USD'),
  Wallet(
    id: 'credit-vnd',
    name: 'Credit',
    balance: -542000,
    currency: 'VND',
    type: 'CREDIT',
  ),
];

class FinanceSceneRepository extends FinanceRepository {
  @override
  String? peekWorkspaceDefaultCurrency(String wsId) => 'VND';

  @override
  Future<String> getWorkspaceDefaultCurrency(
    String wsId, {
    bool forceRefresh = false,
  }) async => 'VND';

  @override
  Future<List<Wallet>> getWallets(String wsId) async => _wallets;

  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async => const [
    TransactionCategory(
      id: 'food',
      name: 'Groceries',
      icon: 'ShoppingCart',
      amount: 420000,
    ),
    TransactionCategory(id: 'home', name: 'Home', icon: 'House'),
    TransactionCategory(id: 'transport', name: 'Transport', icon: 'Car'),
    TransactionCategory(id: 'coffee', name: 'Coffee', icon: 'Coffee'),
    TransactionCategory(id: 'health', name: 'Health', icon: 'Heart'),
    TransactionCategory(id: 'gifts', name: 'Gifts', icon: 'Gift'),
    TransactionCategory(id: 'shopping', name: 'Shopping', icon: 'ShoppingBag'),
    TransactionCategory(id: 'other', name: 'Other', icon: 'Ellipsis'),
    TransactionCategory(id: 'salary', name: 'Salary', isExpense: false),
  ];

  @override
  Future<List<FinanceTag>> getTags(String wsId) async => const [];

  @override
  Future<String?> readWorkspaceDefaultCurrencyFromCache(String wsId) async =>
      'VND';

  @override
  Future<List<ExchangeRate>> getExchangeRates() async =>
      financeSceneState.exchangeRates;

  @override
  Future<Wallet?> getWalletById({
    required String wsId,
    required String walletId,
  }) async => _wallets.where((wallet) => wallet.id == walletId).firstOrNull;

  @override
  Future<InfiniteTransactionResponse> getTransactionsInfinite({
    required String wsId,
    int limit = 20,
    String? cursor,
    String? search,
    String? walletId,
    FinanceTransactionQuery query = const FinanceTransactionQuery(),
  }) async => InfiniteTransactionResponse(
    data: financeSceneState.recentTransactions,
    hasMore: false,
  );

  @override
  Future<TransactionStats> getTransactionStats({
    required String wsId,
    String? walletId,
    String? search,
    FinanceTransactionQuery filters = const FinanceTransactionQuery(),
  }) async => const TransactionStats(
    totalTransactions: 3,
    totalIncome: 32000000,
    totalExpense: -8420000,
    netTotal: 23580000,
    currency: 'VND',
  );

  @override
  Future<FinanceBudgetList> getBudgets(
    String wsId, {
    bool forceRefresh = false,
  }) async => (
    budgets: [
      FinanceBudget(
        id: 'groceries-budget',
        name: 'Groceries',
        amount: 5000000,
        spent: 3250000,
        startDate: DateTime(2026, 11),
        walletId: 'wallet-vnd',
        categoryId: 'food',
      ),
      FinanceBudget(
        id: 'transport-budget',
        name: 'Transport',
        amount: 2500000,
        spent: 800000,
        startDate: DateTime(2026, 11),
        walletId: 'wallet-vnd',
        categoryId: 'transport',
      ),
    ],
    pendingIds: <String>{},
  );

  WalletCheckpoint get _checkpoint => WalletCheckpoint(
    id: 'checkpoint',
    walletId: 'wallet-vnd',
    actualBalance: 1250000,
    ledgerBalance: 1250000,
    currentLedgerBalance: 1250000,
    originalVariance: 0,
    currentVariance: 0,
    currency: 'VND',
    checkedAt: financeSceneDate,
    createdAt: financeSceneDate,
    updatedAt: financeSceneDate,
  );

  @override
  Future<WalletCheckpointSummaryResponse> getWalletCheckpointSummary({
    required String wsId,
    bool forceRefresh = false,
  }) async => WalletCheckpointSummaryResponse(
    wallets: [
      ..._wallets,
      Wallet(
        id: 'wallet-old',
        name: 'Old cash',
        currency: 'VND',
        archivedAt: financeSceneDate,
      ),
    ],
    latestCheckpoints: [
      _checkpoint,
      WalletCheckpoint(
        id: 'checkpoint-usd',
        walletId: 'wallet-usd',
        actualBalance: 1224.5,
        ledgerBalance: 1240,
        currentLedgerBalance: 1240,
        originalVariance: -15.5,
        currentVariance: -15.5,
        currency: 'USD',
        checkedAt: financeSceneDate,
        createdAt: financeSceneDate,
        updatedAt: financeSceneDate,
      ),
    ],
    totalsByCurrency: const [
      WalletCheckpointCurrencyTotal(
        currency: 'VND',
        actualTotal: 1250000,
        ledgerTotal: 1250000,
        varianceTotal: 0,
        checkpointCount: 1,
      ),
    ],
  );

  @override
  Future<WalletCheckpointListResponse> getWalletCheckpoints({
    required String wsId,
    required String walletId,
    int limit = 50,
    bool forceRefresh = false,
  }) async => WalletCheckpointListResponse(
    data: [_checkpoint],
    intervals: const [],
    latest: _checkpoint,
  );
}

final financeSceneState = FinanceState(
  status: FinanceStatus.loaded,
  wallets: _wallets,
  workspaceCurrency: 'VND',
  exchangeRates: const [
    ExchangeRate(
      baseCurrency: 'USD',
      targetCurrency: 'VND',
      rate: 25000,
      date: '2026-11-18',
    ),
  ],
  monthFlow: const FinanceFlow(
    currency: 'VND',
    income: 32000000,
    expense: -8420000,
  ),
  recentTransactions: [
    Transaction(
      id: 'groceries',
      description: 'Market groceries',
      amount: -420000,
      categoryName: 'Groceries',
      categoryIcon: 'ShoppingCart',
      walletName: 'Everyday',
      walletCurrency: 'VND',
      takenAt: financeSceneDate,
    ),
    Transaction(
      id: 'salary',
      description: 'November payroll',
      amount: 32000000,
      categoryName: 'Salary',
      walletName: 'Everyday',
      walletCurrency: 'VND',
      takenAt: financeSceneDate.subtract(const Duration(days: 1)),
    ),
    Transaction(
      id: 'book',
      description: 'Design books',
      amount: -32,
      categoryName: 'Education',
      walletName: 'Savings',
      walletCurrency: 'USD',
      takenAt: financeSceneDate.subtract(const Duration(days: 2)),
    ),
  ],
);

class _SceneWorkspace extends Mock implements WorkspaceCubit {}

class _SceneSettings extends SettingsRepository {
  _SceneSettings({required this.visible});

  bool visible;

  @override
  Future<bool> getFinanceAmountsVisible() async => visible;

  @override
  Future<void> setFinanceAmountsVisible({required bool value}) async =>
      visible = value;
}

enum FinanceScene {
  overview('Finance', Routes.finance),
  transactions('Transactions', Routes.transactions),
  transactionDetail('Transactions', Routes.transactions),
  budgets('Budgets', Routes.financeBudgets),
  wallets('Wallets', Routes.wallets),
  walletDetail('Everyday', Routes.walletDetail),
  checkpoints('Checkpoints', Routes.financeCheckpoints),
  categories('Categories', Routes.categories),
  debts('Debts & loans', Routes.financeDebts),
  analytics('Analytics', Routes.financeAnalytics);

  const FinanceScene(this.title, this.route);

  final String title;
  final String route;
}

/// Scenes whose primary create action sits in the dock's priority slot.
const Set<FinanceScene> financeSceneCreates = {
  FinanceScene.overview,
  FinanceScene.transactions,
  FinanceScene.budgets,
  FinanceScene.wallets,
  FinanceScene.walletDetail,
  FinanceScene.checkpoints,
  FinanceScene.debts,
};

class FinanceScreenScene extends StatefulWidget {
  const FinanceScreenScene({
    required this.scene,
    this.showAmounts = false,
    this.page,
    super.key,
  });

  final FinanceScene scene;
  final bool showAmounts;
  final Widget? page;

  @override
  State<FinanceScreenScene> createState() => _FinanceScreenSceneState();
}

class _FinanceScreenSceneState extends State<FinanceScreenScene> {
  final _controller = ScrollController();
  final _repository = FinanceSceneRepository();
  final _workspace = _SceneWorkspace();
  late final _preferences = FinancePreferencesCubit(
    settingsRepository: _SceneSettings(visible: widget.showAmounts),
  );

  @override
  void initState() {
    super.initState();
    when(() => _workspace.state).thenReturn(
      const WorkspaceState(currentWorkspace: Workspace(id: _sceneWorkspaceId)),
    );
    when(() => _workspace.stream).thenAnswer((_) => const Stream.empty());
    unawaited(_preferences.load());
  }

  @override
  void dispose() {
    unawaited(_preferences.close());
    _controller.dispose();
    super.dispose();
  }

  Widget _content() => switch (widget.scene) {
    FinanceScene.overview => FinanceOverviewContent(
      state: financeSceneState,
      now: financeSceneDate,
      onTransactionTap: (_) {},
      onCreate: () {},
      onRecurring: () {},
    ),
    FinanceScene.transactions => TransactionListBody(
      state: TransactionListState(
        status: TransactionListStatus.loaded,
        transactions: financeSceneState.recentTransactions,
        workspaceCurrency: financeSceneState.workspaceCurrency,
        exchangeRates: financeSceneState.exchangeRates,
        flow: financeSceneState.monthFlow,
        query: FinanceTransactionQuery.month(financeSceneDate),
        hasMore: false,
      ),
      controller: _controller,
      now: financeSceneDate,
      onRefresh: () async {},
      onTransactionTap: (_) {},
      onFiltersChanged: (_, _) {},
      onClearFilters: () {},
      onCreate: () {},
    ),
    FinanceScene.transactionDetail => Builder(
      builder: (context) => Center(
        child: TextButton(
          onPressed: () => unawaited(
            showTransactionDetailSheet(
              context,
              wsId: 'fixture-finance',
              transaction: financeSceneState.recentTransactions.first,
              repository: _repository,
              workspaceCurrency: financeSceneState.workspaceCurrency,
              exchangeRates: financeSceneState.exchangeRates,
              onSave:
                  ({
                    required transactionId,
                    required amount,
                    description,
                    takenAt,
                    walletId,
                    categoryId,
                    tagIds,
                    reportOptIn,
                    isAmountConfidential,
                    isDescriptionConfidential,
                    isCategoryConfidential,
                  }) async => financeSceneState.recentTransactions.first,
              onDelete: (_) async {},
            ),
          ),
          child: const Text('Open transaction details'),
        ),
      ),
    ),
    FinanceScene.budgets => BudgetsPage(
      repository: _repository,
      now: financeSceneDate,
    ),
    FinanceScene.wallets => WalletsPage(repository: _repository),
    FinanceScene.walletDetail => WalletDetailPage(
      walletId: 'wallet-vnd',
      repository: _repository,
      now: financeSceneDate,
    ),
    FinanceScene.checkpoints => FinanceCheckpointsPage(repository: _repository),
    FinanceScene.categories => TransactionCategoriesPage(
      repository: _repository,
    ),
    FinanceScene.debts => DebtsPage(
      repository: FinanceSceneDebtsRepository(),
      financeRepository: _repository,
      now: financeSceneDate,
    ),
    FinanceScene.analytics => FinanceAnalyticsPage(
      repository: FinanceSceneAnalyticsRepository(),
      financeRepository: _repository,
      now: financeSceneDate,
      timezone: 'Asia/Ho_Chi_Minh',
    ),
  };

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final chrome = ShellChromeStyle.of(context);
    final l10n = context.l10n;
    final scene = widget.scene;
    final selected =
        financePrimaryNavItems[miniNavSelectedIndex(
          scene.route,
          financePrimaryNavItems,
        )];
    final extra = financeExtraNavItems.any((item) => item.route == scene.route);
    // The dock always reserves the priority slot for the create action.
    final dockCreate = financeSceneCreates.contains(scene);
    return MultiBlocProvider(
      providers: [
        BlocProvider<WorkspaceCubit>.value(value: _workspace),
        BlocProvider.value(value: _preferences),
      ],
      child: ColoredBox(
        color: chrome.page,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Padding(
              padding: EdgeInsets.only(top: media.padding.top + 56),
              child: MediaQuery(
                data: media.copyWith(
                  padding: media.padding.copyWith(
                    top: 0,
                    bottom: AppPageInsets.contentBottomClearance(
                      context,
                      safeBottom: media.padding.bottom,
                    ),
                  ),
                ),
                child: widget.page ?? _content(),
              ),
            ),
            Positioned(
              top: media.padding.top,
              left: 16,
              right: 16,
              height: 56,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      scene.title,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  if ({
                    FinanceScene.overview,
                    FinanceScene.transactions,
                    FinanceScene.wallets,
                  }.contains(scene))
                    ShellTopBarButton(
                      icon: const Icon(LucideIcons.search),
                      onPressed: () {},
                    ),
                  ShellTopBarButton(
                    key: const ValueKey('finance-scene-eye'),
                    icon: Icon(
                      widget.showAmounts ? LucideIcons.eye : LucideIcons.eyeOff,
                    ),
                    highlighted: !widget.showAmounts,
                    onPressed: _preferences.toggleShowAmounts,
                  ),
                  if (scene == FinanceScene.categories ||
                      (financeSceneCreates.contains(scene) && !dockCreate))
                    ShellTopBarButton(
                      icon: const Icon(AppIcons.add),
                      filled: true,
                      onPressed: () {},
                    ),
                ],
              ),
            ),
            Positioned(
              bottom: ShellDockMetrics.bottomOffset(media.padding.bottom),
              left: 12,
              right: 12,
              child: Center(
                child: SizedBox(
                  width: ShellDockMetrics.widthFor(media.size.width),
                  child: ShellDockSurface(
                    child: Row(
                      children: [
                        SizedBox(
                          width: ShellDockMetrics.slot,
                          child: IconButton(
                            key: const ValueKey('back'),
                            tooltip: l10n.navBack,
                            icon: const Icon(AppIcons.back),
                            onPressed: () {},
                          ),
                        ),
                        Expanded(
                          child: ShellDockBar(
                            ownsZones: false,
                            labelled: false,
                            entries: [
                              for (final item in financePrimaryNavItems)
                                ShellDockEntry(
                                  key: ValueKey(item.id),
                                  label: item.label(l10n),
                                  glyph: Icon(item.icon),
                                ),
                              ShellDockEntry(
                                key: const ValueKey('finance_more'),
                                label: l10n.navMore,
                                glyph: const Icon(Icons.more_horiz),
                              ),
                            ],
                            selectedKey: ValueKey(
                              extra ? 'finance_more' : selected.id,
                            ),
                            onSelected: (_) {},
                          ),
                        ),
                        if (dockCreate) ...[
                          const SizedBox(width: ShellDockMetrics.zoneGap),
                          ShellDockActionButton(
                            key: const ValueKey('finance-scene-create'),
                            action: ShellActionSpec(
                              id: 'create',
                              icon: AppIcons.add,
                              tooltip: l10n.financeNewTransaction,
                              filled: true,
                              inDock: true,
                              onPressed: () {},
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
