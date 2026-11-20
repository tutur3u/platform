import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/finance/finance_module.dart';
import 'package:mobile/features/finance/view/bill_splits_page.dart';
import 'package:mobile/features/finance/view/budgets_page.dart';
import 'package:mobile/features/finance/view/debts_page.dart';
import 'package:mobile/features/finance/view/finance_analytics_page.dart';
import 'package:mobile/features/finance/view/finance_checkpoints_page.dart';
import 'package:mobile/features/finance/view/finance_promotions_page.dart';
import 'package:mobile/features/finance/view/transaction_categories_page.dart';
import 'package:mobile/features/finance/view/transaction_list_page.dart';
import 'package:mobile/features/finance/view/wallet_detail_page.dart';
import 'package:mobile/features/finance/view/wallets_page.dart';

/// The finance mini app's routes. Each page registers the Finance dock.
List<RouteBase> financeRoutes() => [
  GoRoute(
    path: Routes.transactions,
    builder: (context, state) => FinanceDockRegistration(
      location: state.uri.path,
      child: TransactionListPage(
        initialTransactionId: state.uri.queryParameters['transactionId'],
        startInSearch: state.uri.queryParameters['search'] == '1',
      ),
    ),
  ),
  GoRoute(
    path: Routes.transactionDetail,
    redirect: (context, state) {
      final id = state.pathParameters['transactionId'];
      return id == null
          ? Routes.transactions
          : Routes.transactionDetailsLocation(id);
    },
  ),
  GoRoute(
    path: Routes.categories,
    builder: (context, state) => const FinanceDockRegistration(
      location: Routes.categories,
      child: TransactionCategoriesPage(),
    ),
  ),
  GoRoute(
    path: Routes.financeBudgets,
    builder: (context, state) => const FinanceDockRegistration(
      location: Routes.financeBudgets,
      child: BudgetsPage(),
    ),
  ),
  GoRoute(
    path: Routes.financeAnalytics,
    builder: (context, state) => const FinanceDockRegistration(
      location: Routes.financeAnalytics,
      child: FinanceAnalyticsPage(),
    ),
  ),
  GoRoute(
    path: Routes.financeDebts,
    builder: (context, state) => const FinanceDockRegistration(
      location: Routes.financeDebts,
      child: DebtsPage(),
    ),
  ),
  GoRoute(
    path: Routes.financePromotions,
    builder: (context, state) => const FinanceDockRegistration(
      location: Routes.financePromotions,
      child: FinancePromotionsPage(),
    ),
  ),
  // Wallet creation lives on Wallets; old Manage links land there.
  GoRoute(path: Routes.financeManage, redirect: (_, _) => Routes.wallets),
  GoRoute(
    path: Routes.financeBillSplits,
    builder: (context, state) => FinanceDockRegistration(
      location: Routes.financeBillSplits,
      detailBackRoute: state.uri.queryParameters.containsKey('split')
          ? Routes.financeBillSplits
          : null,
      child: BillSplitsPage(
        splitId: state.uri.queryParameters['split'],
        participantId: state.uri.queryParameters['participant'],
        settlement: state.uri.queryParameters['settlement'] == '1',
      ),
    ),
  ),
  GoRoute(path: Routes.financeMore, builder: financeMoreFallback),
  GoRoute(path: Routes.financeReports, redirect: (_, _) => Routes.finance),
  GoRoute(
    path: Routes.wallets,
    builder: (context, state) => const FinanceDockRegistration(
      location: Routes.wallets,
      child: WalletsPage(),
    ),
  ),
  GoRoute(
    path: Routes.financeCheckpoints,
    builder: (context, state) => FinanceDockRegistration(
      location: state.uri.path,
      child: FinanceCheckpointsPage(
        initialWalletId: state.uri.queryParameters['walletId'],
      ),
    ),
  ),
  GoRoute(
    path: Routes.walletDetail,
    builder: (context, state) {
      final walletId = state.pathParameters['walletId'];
      return FinanceDockRegistration(
        location: state.uri.path,
        child: walletId == null || walletId.isEmpty
            ? const WalletsPage()
            : WalletDetailPage(walletId: walletId),
      );
    },
  ),
];
