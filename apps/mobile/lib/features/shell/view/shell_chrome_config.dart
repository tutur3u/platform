import 'package:flutter/widgets.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/inventory/view/inventory_catalog_hub.dart';
import 'package:mobile/l10n/l10n.dart';

enum ShellNavMode { global, miniApp, hidden }

class ShellChromeConfig {
  const ShellChromeConfig({required this.title, required this.navMode});

  factory ShellChromeConfig.forLocation(
    BuildContext context,
    String matchedLocation,
  ) {
    final l10n = context.l10n;
    final catalog = InventoryCatalogSection.values
        .where((s) => Routes.inventoryCatalogPath(s.name) == matchedLocation)
        .firstOrNull;
    if (catalog != null) {
      return ShellChromeConfig(
        title: inventoryCatalogTitle(context, catalog),
        navMode: ShellNavMode.miniApp,
      );
    }
    if (matchedLocation.startsWith('${Routes.settingsOffline}/')) {
      final module = matchedLocation.split('/').last;
      final title = switch (module) {
        'finance' => l10n.financeTitle,
        'inventory' => l10n.inventoryTitle,
        'tasks' => l10n.tasksTitle,
        'calendar' => l10n.calendarTitle,
        _ => l10n.offlineSectionTitle,
      };
      return ShellChromeConfig(title: title, navMode: ShellNavMode.miniApp);
    }
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
      Routes.inventorySalesPeriods => l10n.inventorySalesPeriodsTitle,
      Routes.inventoryCheckout => l10n.inventoryCheckoutTitle,
      Routes.inventoryProductCreate => l10n.inventoryCreateProduct,
      Routes.inventoryAuditLogs => l10n.inventoryAuditLabel,
      Routes.storefronts => l10n.storefrontTitle,
      Routes.transactions => l10n.financeActivityLabel,
      Routes.financeCheckpoints => l10n.financeCheckpointsTitle,
      Routes.categories => l10n.financeManageLabel,
      Routes.wallets => l10n.financeWallets,
      Routes.timer => l10n.timerTitle,
      Routes.timerHistory => l10n.timerHistory,
      Routes.timerStats => l10n.timerStatsTitle,
      Routes.timerRequests => l10n.timerRequestsTitle,
      Routes.habits => l10n.habitsTitle,
      Routes.habitsActivity => l10n.habitsActivityTitle,
      Routes.taskBoards => l10n.taskBoardsTitle,
      Routes.taskPlanning => l10n.taskPlanningTitle,
      Routes.taskEstimates => l10n.taskPlanningTitle,
      Routes.taskPortfolio => l10n.taskPlanningTitle,
      Routes.profileRoot => l10n.profileTitle,
      Routes.profileEdit || Routes.settingsProfile => l10n.settingsNavYou,
      Routes.profileAccounts ||
      Routes.settingsAccounts => l10n.authManageAccounts,
      Routes.settingsOffline => l10n.offlineSectionTitle,
      Routes.settingsInternalAccounts => l10n.adminAccountsTitle,
      Routes.settingsWhatsNew => l10n.settingsWhatsNew,
      Routes.settingsReminders => l10n.remindersTitle,
      Routes.settingsAccountSecurity => l10n.securitySessionsTitle,
      Routes.settingsMfaApproval => l10n.deviceMfaNumberTitle,
      Routes.settingsQrLoginScan => l10n.qrLoginSettingsTitle,
      Routes.settings => l10n.settingsTitle,
      Routes.settingsPreferences => l10n.settingsPreferencesSectionTitle,
      Routes.settingsExperiments => l10n.settingsExperimentalAppsSectionTitle,
      Routes.settingsInfrastructure => l10n.settingsInfrastructureSectionTitle,
      Routes.settingsAbout => l10n.settingsAboutSectionTitle,
      Routes.settingsSession => l10n.settingsDangerSectionTitle,
      Routes.settingsWorkspace => l10n.settingsWorkspaceSectionTitle,
      Routes.settingsWorkspaceSecrets => l10n.settingsWorkspaceSecretsTitle,
      Routes.settingsWorkspaceMembers => l10n.settingsWorkspaceMembersTitle,
      Routes.settingsWorkspaceRoles => l10n.settingsWorkspaceRolesTitle,
      Routes.settingsMobileVersions => l10n.settingsMobileVersionsTitle,
      _ => null,
    };

    if (title != null) {
      return ShellChromeConfig(
        title: title,
        navMode:
            matchedLocation != Routes.profileRoot &&
                matchedLocation != Routes.notifications &&
                AppRegistry.moduleFromLocation(matchedLocation) != null
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

    return ShellChromeConfig(title: l10n.navApps, navMode: ShellNavMode.global);
  }

  final String title;
  final ShellNavMode navMode;
}
