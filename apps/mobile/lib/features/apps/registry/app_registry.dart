import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/crm/view/crm_page.dart';
import 'package:mobile/features/drive/view/drive_page.dart';
import 'package:mobile/features/education/view/education_page.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/habits/view/habits_page.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/inventory/view/inventory_page.dart';
import 'package:mobile/features/notifications/view/notifications_page.dart';
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/tasks/view/task_list_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppRegistry {
  const AppRegistry._();

  static const List<AppModule> allModules = [
    AppModule(
      id: 'habits',
      route: Routes.habits,
      icon: Icons.repeat_rounded,
      labelBuilder: _labelHabits,
      pageBuilder: _pageHabits,
      miniAppNavItems: _habitsMiniNav,
      isPinned: true,
      isVisible: _showHabitsModule,
    ),
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
      id: 'drive',
      route: Routes.drive,
      icon: Icons.folder_copy_outlined,
      labelBuilder: _labelDrive,
      pageBuilder: _pageDrive,
      miniAppNavItems: _driveMiniNav,
    ),
    AppModule(
      id: 'education',
      route: Routes.education,
      icon: Icons.school_outlined,
      labelBuilder: _labelEducation,
      pageBuilder: _pageEducation,
      miniAppNavItems: _educationMiniNav,
    ),
    AppModule(
      id: 'crm',
      route: Routes.crm,
      icon: Icons.badge_outlined,
      labelBuilder: _labelCrm,
      pageBuilder: _pageCrm,
      miniAppNavItems: _crmMiniNav,
    ),
    AppModule(
      id: 'inventory',
      route: Routes.inventory,
      icon: Icons.inventory_2_outlined,
      labelBuilder: _labelInventory,
      pageBuilder: _pageInventory,
      miniAppNavItems: _inventoryMiniNav,
      isPinned: true,
      isVisible: _showInventoryModule,
    ),
    AppModule(
      id: 'notifications',
      route: Routes.notifications,
      icon: Icons.notifications_none_rounded,
      labelBuilder: _labelNotifications,
      pageBuilder: _pageNotifications,
      miniAppNavItems: _notificationsMiniNav,
      isVisible: _hideNotificationsFromAppsHub,
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
    AppModule(
      id: 'settings',
      route: Routes.settings,
      icon: Icons.tune_rounded,
      labelBuilder: _labelSettingsHub,
      pageBuilder: _pageSettings,
      miniAppNavItems: _settingsMiniNav,
      isVisible: _hideSettingsModuleFromAppsHub,
    ),
  ];

  static const List<MiniAppNavItem> _settingsMiniNav = [
    MiniAppNavItem(
      id: 'settings_app',
      route: Routes.settings,
      icon: Icons.tune_rounded,
      labelBuilder: _labelSettingsNavApp,
    ),
    MiniAppNavItem(
      id: 'settings_workspace',
      route: Routes.settingsWorkspace,
      icon: Icons.apartment_rounded,
      labelBuilder: _labelSettingsNavWorkspace,
    ),
    MiniAppNavItem(
      id: 'settings_you',
      route: Routes.profileRoot,
      icon: Icons.person_outline_rounded,
      labelBuilder: _labelSettingsNavYou,
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
      id: 'tasks_boards',
      route: Routes.taskBoards,
      icon: shad.LucideIcons.squareKanban,
      labelBuilder: _labelTaskBoards,
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

  static const List<MiniAppNavItem> _habitsMiniNav = [
    MiniAppNavItem(
      id: 'habits_today',
      route: Routes.habits,
      icon: Icons.repeat_rounded,
      labelBuilder: _labelHabitsToday,
    ),
    MiniAppNavItem(
      id: 'habits_activity',
      route: Routes.habitsActivity,
      icon: Icons.history_rounded,
      labelBuilder: _labelHabitsActivity,
    ),
    MiniAppNavItem(
      id: 'habits_library',
      route: Routes.habitsLibrary,
      icon: Icons.auto_awesome_outlined,
      labelBuilder: _labelHabitsLibrary,
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
      labelBuilder: _labelFinanceOverview,
    ),
    MiniAppNavItem(
      id: 'finance_history',
      route: Routes.transactions,
      icon: Icons.receipt_long_outlined,
      labelBuilder: _labelFinanceActivity,
    ),
    MiniAppNavItem(
      id: 'finance_wallets',
      route: Routes.wallets,
      icon: Icons.account_balance_wallet_outlined,
      labelBuilder: _labelWallets,
    ),
    MiniAppNavItem(
      id: 'finance_more',
      route: Routes.categories,
      icon: Icons.tune_rounded,
      labelBuilder: _labelFinanceManage,
    ),
  ];

  static const List<MiniAppNavItem> _inventoryMiniNav = [
    MiniAppNavItem(
      id: 'inventory_home',
      route: Routes.inventory,
      icon: Icons.home_outlined,
      labelBuilder: _labelInventoryOverview,
    ),
    MiniAppNavItem(
      id: 'inventory_products',
      route: Routes.inventoryProducts,
      icon: Icons.inventory_2_outlined,
      labelBuilder: _labelInventoryProducts,
    ),
    MiniAppNavItem(
      id: 'inventory_sales',
      route: Routes.inventorySales,
      icon: Icons.point_of_sale_outlined,
      labelBuilder: _labelInventorySales,
    ),
    MiniAppNavItem(
      id: 'inventory_manage',
      route: Routes.inventoryManage,
      icon: Icons.tune_rounded,
      labelBuilder: _labelInventoryManage,
    ),
    MiniAppNavItem(
      id: 'inventory_audit',
      route: Routes.inventoryAuditLogs,
      icon: Icons.history_rounded,
      labelBuilder: _labelInventoryAudit,
    ),
  ];

  static const List<MiniAppNavItem> _driveMiniNav = [
    MiniAppNavItem(
      id: 'drive_home',
      route: Routes.drive,
      icon: Icons.folder_copy_outlined,
      labelBuilder: _labelDrive,
    ),
  ];

  static const List<MiniAppNavItem> _crmMiniNav = [
    MiniAppNavItem(
      id: 'crm_home',
      route: Routes.crm,
      icon: Icons.badge_outlined,
      labelBuilder: _labelCrm,
    ),
  ];

  static const List<MiniAppNavItem> _educationMiniNav = [
    MiniAppNavItem(
      id: 'education_home',
      route: Routes.education,
      icon: Icons.school_outlined,
      labelBuilder: _labelEducation,
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
      isVisible: _showTimerRequestsMiniNav,
    ),
  ];

  static const List<MiniAppNavItem> _notificationsMiniNav = [
    MiniAppNavItem(
      id: 'notifications_inbox',
      route: Routes.notifications,
      icon: Icons.inbox_outlined,
      labelBuilder: _labelNotificationsInbox,
    ),
    MiniAppNavItem(
      id: 'notifications_archive',
      route: Routes.notificationsArchive,
      icon: Icons.archive_outlined,
      labelBuilder: _labelNotificationsArchive,
    ),
  ];

  static bool _showTimerRequestsMiniNav(BuildContext context) {
    final isPersonalWorkspace = context.select<WorkspaceCubit, bool>(
      (cubit) => cubit.state.currentWorkspace?.personal ?? false,
    );
    return !isPersonalWorkspace;
  }

  static bool _showInventoryModule(BuildContext context) {
    final accessState = context
        .select<InventoryAccessCubit?, InventoryAccessState?>(
          (cubit) => cubit?.state,
        );
    if (accessState == null) {
      return false;
    }

    return accessState.status == InventoryAccessStatus.loaded &&
        accessState.enabled;
  }

  static bool _showHabitsModule(BuildContext context) {
    final accessState = context.select<HabitsAccessCubit?, HabitsAccessState?>(
      (cubit) => cubit?.state,
    );
    if (accessState == null) {
      return false;
    }

    return accessState.status == HabitsAccessStatus.loaded &&
        accessState.enabled;
  }

  static bool _hideNotificationsFromAppsHub(BuildContext context) => false;

  static bool _hideSettingsModuleFromAppsHub(BuildContext context) => false;

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
    if (Routes.isSettingsHubLocation(normalizedLocation)) {
      return moduleById('settings');
    }
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
  static String _labelHabits(AppLocalizations l10n) => l10n.navHabits;
  static String _labelHabitsToday(AppLocalizations l10n) =>
      l10n.habitsTodayLabel;
  static String _labelHabitsActivity(AppLocalizations l10n) =>
      l10n.habitsActivityLabel;
  static String _labelHabitsLibrary(AppLocalizations l10n) =>
      l10n.habitsLibraryLabel;
  static String _labelTaskEstimates(AppLocalizations l10n) =>
      l10n.taskPlanningTitle;
  static String _labelTaskBoards(AppLocalizations l10n) => l10n.taskBoardsTitle;
  static String _labelTaskPortfolio(AppLocalizations l10n) =>
      l10n.taskPortfolioTitle;
  static String _labelCalendar(AppLocalizations l10n) => l10n.navCalendar;
  static String _labelFinance(AppLocalizations l10n) => l10n.navFinance;
  static String _labelDrive(AppLocalizations l10n) => l10n.driveTitle;
  static String _labelEducation(AppLocalizations l10n) => l10n.educationTitle;
  static String _labelCrm(AppLocalizations l10n) => l10n.crmTitle;
  static String _labelInventory(AppLocalizations l10n) => l10n.inventoryTitle;
  static String _labelInventoryOverview(AppLocalizations l10n) =>
      l10n.inventoryOverviewLabel;
  static String _labelInventoryProducts(AppLocalizations l10n) =>
      l10n.inventoryProductsLabel;
  static String _labelInventorySales(AppLocalizations l10n) =>
      l10n.inventorySalesLabel;
  static String _labelInventoryManage(AppLocalizations l10n) =>
      l10n.inventoryManageLabel;
  static String _labelInventoryAudit(AppLocalizations l10n) =>
      l10n.inventoryAuditLabel;
  static String _labelFinanceOverview(AppLocalizations l10n) =>
      l10n.financeOverviewLabel;
  static String _labelFinanceActivity(AppLocalizations l10n) =>
      l10n.financeActivityLabel;
  static String _labelFinanceManage(AppLocalizations l10n) =>
      l10n.financeManageLabel;
  static String _labelWallets(AppLocalizations l10n) => l10n.financeWallets;
  static String _labelTimer(AppLocalizations l10n) => l10n.navTimer;
  static String _labelNotifications(AppLocalizations l10n) =>
      l10n.notificationsTitle;
  static String _labelNotificationsInbox(AppLocalizations l10n) =>
      l10n.notificationsInbox;
  static String _labelNotificationsArchive(AppLocalizations l10n) =>
      l10n.notificationsArchive;
  static String _labelTimerHistory(AppLocalizations l10n) => l10n.timerHistory;
  static String _labelTimerStats(AppLocalizations l10n) => l10n.timerStatsTitle;
  static String _timerRequestsTitle(AppLocalizations l10n) =>
      l10n.timerRequestsTitle;

  static Widget _pageTasks(BuildContext context) => const TaskListPage();
  static Widget _pageHabits(BuildContext context) => const HabitsPage();
  static Widget _pageCalendar(BuildContext context) => const CalendarPage();
  static Widget _pageDrive(BuildContext context) => const DrivePage();
  static Widget _pageEducation(BuildContext context) => const EducationPage();
  static Widget _pageCrm(BuildContext context) => const CrmPage();
  static Widget _pageFinance(BuildContext context) => const FinancePage();
  static Widget _pageInventory(BuildContext context) => const InventoryPage();
  static Widget _pageNotifications(BuildContext context) =>
      const NotificationsPage();
  static Widget _pageTimer(BuildContext context) => const TimeTrackerPage();
  static Widget _pageSettings(BuildContext context) => const SettingsPage();

  static String _labelSettingsHub(AppLocalizations l10n) => l10n.settingsTitle;
  static String _labelSettingsNavApp(AppLocalizations l10n) =>
      l10n.settingsNavApp;
  static String _labelSettingsNavWorkspace(AppLocalizations l10n) =>
      l10n.settingsNavWorkspace;
  static String _labelSettingsNavYou(AppLocalizations l10n) =>
      l10n.settingsNavYou;
}
