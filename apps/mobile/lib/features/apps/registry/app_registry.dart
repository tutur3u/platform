import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/tasks/view/task_list_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_page.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppRegistry {
  const AppRegistry._();

  static const List<AppModule> allModules = [
    AppModule(
      id: 'tasks',
      route: Routes.tasks,
      icon: shad.LucideIcons.userCheck,
      labelBuilder: _labelTasks,
      pageBuilder: _pageTasks,
      miniAppNavItems: _tasksMiniNav,
      isPinned: true,
    ),
    AppModule(
      id: 'calendar',
      route: Routes.calendar,
      icon: Icons.calendar_today_outlined,
      labelBuilder: _labelCalendar,
      pageBuilder: _pageCalendar,
      miniAppNavItems: _calendarMiniNav,
      isPinned: true,
    ),
    AppModule(
      id: 'finance',
      route: Routes.finance,
      icon: Icons.account_balance_wallet_outlined,
      labelBuilder: _labelFinance,
      pageBuilder: _pageFinance,
      miniAppNavItems: _financeMiniNav,
      isPinned: true,
    ),
    AppModule(
      id: 'timer',
      route: Routes.timer,
      icon: Icons.timer_outlined,
      labelBuilder: _labelTimer,
      pageBuilder: _pageTimer,
      miniAppNavItems: _timerMiniNav,
      isPinned: true,
    ),
  ];

  static const List<MiniAppNavItem> _tasksMiniNav = [
    MiniAppNavItem(
      id: 'tasks_home',
      route: Routes.tasks,
      icon: shad.LucideIcons.userCheck,
      labelBuilder: _labelTasks,
    ),
    MiniAppNavItem(
      id: 'tasks_estimates',
      route: Routes.taskEstimates,
      icon: shad.LucideIcons.calculator,
      labelBuilder: _labelTaskEstimates,
    ),
    MiniAppNavItem(
      id: 'tasks_portfolio',
      route: Routes.taskPortfolio,
      icon: shad.LucideIcons.gitBranch,
      labelBuilder: _labelTaskPortfolio,
    ),
  ];

  static const List<MiniAppNavItem> _calendarMiniNav = [
    MiniAppNavItem(
      id: 'calendar_home',
      route: Routes.calendar,
      icon: Icons.calendar_today_outlined,
      labelBuilder: _labelCalendar,
    ),
  ];

  static const List<MiniAppNavItem> _financeMiniNav = [
    MiniAppNavItem(
      id: 'finance_home',
      route: Routes.finance,
      icon: Icons.home_outlined,
      labelBuilder: _labelHome,
    ),
    MiniAppNavItem(
      id: 'finance_transactions',
      route: Routes.transactions,
      icon: Icons.receipt_long_outlined,
      labelBuilder: _labelTransactions,
    ),
    MiniAppNavItem(
      id: 'finance_categories',
      route: Routes.categories,
      icon: Icons.category_outlined,
      labelBuilder: _labelCategories,
    ),
    MiniAppNavItem(
      id: 'finance_wallets',
      route: Routes.wallets,
      icon: Icons.account_balance_wallet_outlined,
      labelBuilder: _labelWallets,
    ),
  ];

  static const List<MiniAppNavItem> _timerMiniNav = [
    MiniAppNavItem(
      id: 'timer_home',
      route: Routes.timer,
      icon: Icons.timer_outlined,
      labelBuilder: _labelTimer,
    ),
    MiniAppNavItem(
      id: 'timer_history',
      route: Routes.timerHistory,
      icon: Icons.history,
      labelBuilder: _labelTimerHistory,
    ),
    MiniAppNavItem(
      id: 'timer_stats',
      route: Routes.timerStats,
      icon: Icons.bar_chart_outlined,
      labelBuilder: _labelTimerStats,
    ),
    MiniAppNavItem(
      id: 'timer_requests',
      route: Routes.timerRequests,
      icon: Icons.pending_actions,
      labelBuilder: _timerRequestsTitle,
    ),
  ];

  static List<AppModule> modules(BuildContext context) {
    return allModules
        .where((module) => module.visibleIn(context))
        .toList(growable: false);
  }

  static List<AppModule> pinnedModules(BuildContext context) {
    return modules(
      context,
    ).where((module) => module.isPinned).toList(growable: false);
  }

  static AppModule? moduleById(String? id) {
    if (id == null) return null;
    for (final module in allModules) {
      if (module.id == id) return module;
    }
    return null;
  }

  static AppModule? moduleFromLocation(String location) {
    String normalize(String value) {
      var normalized = value;
      while (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.substring(0, normalized.length - 1);
      }
      return normalized;
    }

    final normalizedLocation = normalize(location);
    for (final module in allModules) {
      final normalizedRoute = normalize(module.route);
      if (normalizedLocation == normalizedRoute ||
          normalizedLocation.startsWith('$normalizedRoute/')) {
        return module;
      }
    }
    return null;
  }

  static String _labelTasks(AppLocalizations l10n) => l10n.navTasks;
  static String _labelTaskEstimates(AppLocalizations l10n) =>
      l10n.taskPlanningTitle;
  static String _labelTaskPortfolio(AppLocalizations l10n) =>
      l10n.taskPortfolioTitle;
  static String _labelCalendar(AppLocalizations l10n) => l10n.navCalendar;
  static String _labelFinance(AppLocalizations l10n) => l10n.navFinance;
  static String _labelWallets(AppLocalizations l10n) => l10n.financeWallets;
  static String _labelTimer(AppLocalizations l10n) => l10n.navTimer;
  static String _labelHome(AppLocalizations l10n) => l10n.navHome;
  static String _labelTransactions(AppLocalizations l10n) =>
      l10n.financeTransactions;
  static String _labelCategories(AppLocalizations l10n) =>
      l10n.financeCategories;
  static String _labelTimerHistory(AppLocalizations l10n) => l10n.timerHistory;
  static String _labelTimerStats(AppLocalizations l10n) => l10n.timerStatsTitle;
  static String _timerRequestsTitle(AppLocalizations l10n) =>
      l10n.timerRequestsTitle;

  static Widget _pageTasks(BuildContext context) => const TaskListPage();
  static Widget _pageCalendar(BuildContext context) => const CalendarPage();
  static Widget _pageFinance(BuildContext context) => const FinancePage();
  static Widget _pageTimer(BuildContext context) => const TimeTrackerPage();
}
