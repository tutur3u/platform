import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/tasks/view/task_list_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_page.dart';
import 'package:mobile/l10n/l10n.dart';

class AppRegistry {
  static const List<AppModule> allModules = [
    AppModule(
      id: 'tasks',
      route: Routes.tasks,
      icon: Icons.check_box_outlined,
      labelBuilder: _labelTasks,
      pageBuilder: _pageTasks,
      isPinned: true,
    ),
    AppModule(
      id: 'calendar',
      route: Routes.calendar,
      icon: Icons.calendar_today_outlined,
      labelBuilder: _labelCalendar,
      pageBuilder: _pageCalendar,
      isPinned: true,
    ),
    AppModule(
      id: 'finance',
      route: Routes.finance,
      icon: Icons.account_balance_wallet_outlined,
      labelBuilder: _labelFinance,
      pageBuilder: _pageFinance,
      isPinned: true,
    ),
    AppModule(
      id: 'timer',
      route: Routes.timer,
      icon: Icons.timer_outlined,
      labelBuilder: _labelTimer,
      pageBuilder: _pageTimer,
      isPinned: true,
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
    for (final module in allModules) {
      if (location.startsWith(module.route)) return module;
    }
    return null;
  }

  static String _labelTasks(AppLocalizations l10n) => l10n.navTasks;
  static String _labelCalendar(AppLocalizations l10n) => l10n.navCalendar;
  static String _labelFinance(AppLocalizations l10n) => l10n.navFinance;
  static String _labelTimer(AppLocalizations l10n) => l10n.navTimer;

  static Widget _pageTasks(BuildContext context) => const TaskListPage();
  static Widget _pageCalendar(BuildContext context) => const CalendarPage();
  static Widget _pageFinance(BuildContext context) => const FinancePage();
  static Widget _pageTimer(BuildContext context) => const TimeTrackerPage();
}
