import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/l10n/l10n.dart';

const financeModule = AppModule(
  id: 'finance',
  route: Routes.finance,
  icon: Icons.account_balance_wallet_outlined,
  labelBuilder: _label,
  pageBuilder: _page,
  miniAppNavItems: _fallbackNavItems,
);

const financePrimaryNavItems = <MiniAppNavItem>[
  MiniAppNavItem(
    id: 'finance_home',
    route: Routes.finance,
    icon: LucideIcons.chartPie,
    labelBuilder: _overview,
  ),
  MiniAppNavItem(
    id: 'finance_history',
    route: Routes.transactions,
    icon: LucideIcons.arrowLeftRight,
    labelBuilder: _transactions,
  ),
  MiniAppNavItem(
    id: 'finance_budgets',
    route: Routes.financeBudgets,
    icon: LucideIcons.target,
    labelBuilder: _budgets,
  ),
  MiniAppNavItem(
    id: 'finance_wallets',
    route: Routes.wallets,
    icon: LucideIcons.wallet,
    labelBuilder: _wallets,
  ),
];

const financeExtraNavItems = <MiniAppNavItem>[
  MiniAppNavItem(
    id: 'finance_categories',
    route: Routes.categories,
    icon: LucideIcons.tags,
    labelBuilder: _categories,
  ),
  MiniAppNavItem(
    id: 'finance_reports',
    route: Routes.financeReports,
    icon: LucideIcons.chartPie,
    labelBuilder: _reports,
  ),
  MiniAppNavItem(
    id: 'finance_checkpoints',
    route: Routes.financeCheckpoints,
    icon: LucideIcons.listChecks,
    labelBuilder: _checkpoints,
  ),
  MiniAppNavItem(
    id: 'finance_manage',
    route: Routes.financeManage,
    icon: Icons.tune_rounded,
    labelBuilder: _manage,
  ),
];

const _fallbackNavItems = <MiniAppNavItem>[
  ...financePrimaryNavItems,
  MiniAppNavItem(
    id: 'finance_more',
    route: Routes.financeManage,
    aliasRoutes: [
      Routes.categories,
      Routes.financeReports,
      Routes.financeCheckpoints,
    ],
    icon: Icons.more_horiz,
    labelBuilder: _more,
  ),
];

const financeMiniAppNavItems = <MiniAppNavItem>[
  ...financePrimaryNavItems,
  ...financeExtraNavItems,
];

class FinanceDockRegistration extends StatelessWidget {
  const FinanceDockRegistration({
    required this.location,
    required this.child,
    super.key,
  });

  final String location;
  final Widget child;

  Future<void> _openMore(BuildContext context, String? selected) async {
    final l10n = context.l10n;
    final route = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.navMore,
      selected: selected,
      choices: [
        for (final item in financeExtraNavItems)
          AppSheetChoice(
            value: item.route,
            label: item.label(l10n),
            icon: item.icon,
          ),
      ],
    );
    if (context.mounted && route != null && route != selected) {
      context.go(route);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final index = miniNavSelectedIndex(location, financeMiniAppNavItems);
    final active = financeMiniAppNavItems[index];
    final moreSelected = index >= financePrimaryNavItems.length;
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellMiniNav(
          ownerId: 'finance-dock',
          locations: {location},
          deepLinkBackRoute: location.startsWith('${Routes.wallets}/')
              ? Routes.wallets
              : location == Routes.finance
              ? Routes.apps
              : Routes.finance,
          items: [
            ShellMiniNavItemSpec(
              id: 'back',
              icon: Icons.chevron_left,
              label: l10n.navBack,
            ),
            for (final item in financePrimaryNavItems)
              ShellMiniNavItemSpec(
                id: item.id,
                label: item.label(l10n),
                icon: item.icon,
                selected: active == item,
                onPressed: () => context.go(item.route),
              ),
            ShellMiniNavItemSpec(
              id: 'finance_more',
              label: l10n.navMore,
              icon: Icons.more_horiz,
              selected: moreSelected,
              onPressed: () => unawaited(
                _openMore(context, moreSelected ? active.route : null),
              ),
              onReselect: () => unawaited(_openMore(context, active.route)),
            ),
          ],
        ),
        child,
      ],
    );
  }
}

String _more(AppLocalizations l10n) => l10n.navMore;
String _label(AppLocalizations l10n) => l10n.navFinance;
String _overview(AppLocalizations l10n) => l10n.financeOverviewLabel;
String _transactions(AppLocalizations l10n) => l10n.financeTransactions;
String _wallets(AppLocalizations l10n) => l10n.financeWallets;
String _budgets(AppLocalizations l10n) => l10n.financeBudgets;
String _categories(AppLocalizations l10n) => l10n.financeCategories;
String _reports(AppLocalizations l10n) => l10n.financeReports;
String _checkpoints(AppLocalizations l10n) => l10n.financeCheckpointsShortLabel;
String _manage(AppLocalizations l10n) => l10n.financeManageLabel;
Widget _page(BuildContext context) => const FinanceDockRegistration(
  location: Routes.finance,
  child: FinancePage(),
);
