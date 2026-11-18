import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
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
import 'package:mobile/features/finance/view/finance_checkpoints_page.dart';
import 'package:mobile/features/finance/view/finance_overview_month.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/finance/view/finance_secondary_pages.dart';
import 'package:mobile/features/finance/view/transaction_categories_page.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';
import 'package:mobile/features/finance/view/transaction_list_body.dart';
import 'package:mobile/features/finance/view/wallet_detail_page.dart';
import 'package:mobile/features/finance/view/wallets_page.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';

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
    TransactionCategory(id: 'food', name: 'Groceries', icon: 'ShoppingCart'),
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
        categoryId: 'food',
      ),
      FinanceBudget(
        id: 'transport-budget',
        name: 'Transport',
        amount: 2500000,
        spent: 800000,
        startDate: DateTime(2026, 11),
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
    wallets: _wallets,
    latestCheckpoints: [_checkpoint],
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
  reports('Reports', Routes.financeReports),
  manage('Manage', Routes.financeManage);

  const FinanceScene(this.title, this.route);

  final String title;
  final String route;
}

class FinanceScreenScene extends StatefulWidget {
  const FinanceScreenScene({
    required this.scene,
    this.showAmounts = false,
    super.key,
  });

  final FinanceScene scene;
  final bool showAmounts;

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
      const WorkspaceState(currentWorkspace: Workspace(id: 'fixture-finance')),
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
    ),
    FinanceScene.checkpoints => FinanceCheckpointsPage(repository: _repository),
    FinanceScene.categories => TransactionCategoriesPage(
      repository: _repository,
    ),
    FinanceScene.reports => AppPageListView(
      children: [
        FinanceMonthSummary(
          flow: financeSceneState.monthFlow,
          month: financeSceneDate,
        ),
      ],
    ),
    FinanceScene.manage => const FinanceManagePage(),
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
                child: _content(),
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
                  ShellTopBarButton(
                    icon: Icon(
                      widget.showAmounts ? LucideIcons.eye : LucideIcons.eyeOff,
                    ),
                    highlighted: !widget.showAmounts,
                    onPressed: _preferences.toggleShowAmounts,
                  ),
                  if ({
                    FinanceScene.overview,
                    FinanceScene.transactions,
                  }.contains(scene))
                    ShellTopBarButton(
                      icon: const Icon(LucideIcons.search),
                      onPressed: () {},
                    ),
                  if ({
                    FinanceScene.overview,
                    FinanceScene.transactions,
                    FinanceScene.budgets,
                    FinanceScene.wallets,
                    FinanceScene.walletDetail,
                    FinanceScene.categories,
                  }.contains(scene))
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
