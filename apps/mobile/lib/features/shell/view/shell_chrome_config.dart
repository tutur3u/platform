import 'package:flutter/widgets.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/l10n/l10n.dart';

enum ShellNavMode { global, miniApp, hidden }

class ShellChromeConfig {
  const ShellChromeConfig({
    required this.title,
    required this.navMode,
  });

  factory ShellChromeConfig.forLocation(
    BuildContext context,
    String matchedLocation,
  ) {
    final l10n = context.l10n;
    final title = switch (matchedLocation) {
      Routes.home => l10n.navHome,
      Routes.apps => l10n.navApps,
      Routes.assistant => l10n.navAssistant,
      Routes.notifications => l10n.notificationsTitle,
      Routes.calendar => l10n.calendarTitle,
      Routes.finance => l10n.financeTitle,
      Routes.inventory => l10n.inventoryTitle,
      Routes.inventoryProducts => l10n.inventoryProductsLabel,
      Routes.inventorySales => l10n.inventorySalesLabel,
      Routes.inventoryManage => l10n.inventoryManageLabel,
      Routes.inventoryAuditLogs => l10n.inventoryAuditLabel,
      Routes.transactions => l10n.financeActivityLabel,
      Routes.categories => l10n.financeManageLabel,
      Routes.wallets => l10n.financeWallets,
      Routes.timer => l10n.timerTitle,
      Routes.timerHistory => l10n.timerHistory,
      Routes.timerStats => l10n.timerStatsTitle,
      Routes.timerRequests => l10n.timerRequestsTitle,
      Routes.habits => l10n.habitsTitle,
      Routes.habitsActivity => l10n.habitsActivityTitle,
      Routes.taskBoards => l10n.taskBoardsTitle,
      Routes.taskEstimates => l10n.taskPlanningTitle,
      Routes.taskPortfolio => l10n.taskPortfolioTitle,
      Routes.profileRoot => l10n.profileTitle,
      Routes.profileAccounts => l10n.authManageAccounts,
      Routes.settings => l10n.settingsTitle,
      Routes.settingsWorkspace => l10n.settingsWorkspaceSectionTitle,
      Routes.settingsWorkspaceSecrets => l10n.settingsWorkspaceSecretsTitle,
      Routes.settingsWorkspaceMembers => l10n.settingsWorkspaceMembersTitle,
      Routes.settingsWorkspaceRoles => l10n.settingsWorkspaceRolesTitle,
      _ => null,
    };

    if (title != null) {
      return ShellChromeConfig(
        title: title,
        navMode: AppRegistry.moduleFromLocation(matchedLocation) != null
            ? ShellNavMode.miniApp
            : ShellNavMode.global,
      );
    }

    final module = AppRegistry.moduleFromLocation(matchedLocation);
    if (module != null) {
      return ShellChromeConfig(
        title: module.label(l10n),
        navMode: ShellNavMode.miniApp,
      );
    }

    return ShellChromeConfig(
      title: l10n.navApps,
      navMode: ShellNavMode.global,
    );
  }

  final String title;
  final ShellNavMode navMode;
}
