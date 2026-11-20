import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
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

const financeBillSplitsEnabled = bool.fromEnvironment(
  'ENABLE_FINANCE_BILL_SPLITS',
);

const financeExtraNavItems = <MiniAppNavItem>[
  if (financeBillSplitsEnabled)
    MiniAppNavItem(
      id: 'finance_bill_splits',
      route: Routes.financeBillSplits,
      icon: LucideIcons.receipt,
      labelBuilder: _billSplits,
    ),
  MiniAppNavItem(
    id: 'finance_categories',
    route: Routes.categories,
    aliasRoutes: [Routes.financeMore],
    icon: LucideIcons.tags,
    labelBuilder: _categories,
  ),
  MiniAppNavItem(
    id: 'finance_checkpoints',
    route: Routes.financeCheckpoints,
    icon: LucideIcons.listChecks,
    labelBuilder: _checkpoints,
  ),
  MiniAppNavItem(
    id: 'finance_analytics',
    route: Routes.financeAnalytics,
    icon: LucideIcons.chartLine,
    labelBuilder: _analytics,
  ),
  MiniAppNavItem(
    id: 'finance_debts',
    route: Routes.financeDebts,
    icon: LucideIcons.handCoins,
    labelBuilder: _debts,
  ),
  MiniAppNavItem(
    id: 'finance_promotions',
    route: Routes.financePromotions,
    icon: LucideIcons.ticketPercent,
    labelBuilder: _promotions,
  ),
  // Reserved: the bill-splitting module adds its "Split bills" entry here.
];

const _fallbackNavItems = <MiniAppNavItem>[
  ...financePrimaryNavItems,
  MiniAppNavItem(
    id: 'finance_more',
    route: Routes.financeMore,
    aliasRoutes: [
      Routes.categories,
      Routes.financeCheckpoints,
      Routes.financeAnalytics,
      Routes.financeDebts,
      Routes.financePromotions,
    ],
    icon: Icons.more_horiz,
    labelBuilder: _more,
  ),
];

const financeMiniAppNavItems = <MiniAppNavItem>[
  ...financePrimaryNavItems,
  ...financeExtraNavItems,
];

class FinanceDockRegistration extends StatefulWidget {
  const FinanceDockRegistration({
    required this.location,
    required this.child,
    this.openMoreOnEntry = false,
    this.detailBackRoute,
    super.key,
  });

  final String location;
  final Widget child;
  final bool openMoreOnEntry;
  final String? detailBackRoute;

  @override
  State<FinanceDockRegistration> createState() =>
      _FinanceDockRegistrationState();
}

class _FinanceDockRegistrationState extends State<FinanceDockRegistration> {
  @override
  void initState() {
    super.initState();
    if (widget.openMoreOnEntry) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_openMore(fallback: true));
      });
    }
  }

  Future<void> _openMore({String? selected, bool fallback = false}) async {
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
    if (!mounted) return;
    if (fallback || (route != null && route != selected)) {
      context.go(route ?? Routes.finance);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final location = widget.location;
    final index = miniNavSelectedIndex(location, financeMiniAppNavItems);
    final active = financeMiniAppNavItems[index];
    final moreSelected = index >= financePrimaryNavItems.length;
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellMiniNav(
          ownerId: 'finance-dock',
          locations: {location},
          deepLinkBackRoute:
              widget.detailBackRoute ??
              (location.startsWith('${Routes.wallets}/')
                  ? Routes.wallets
                  : location == Routes.finance
                  ? Routes.apps
                  : Routes.finance),
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
                _openMore(selected: moreSelected ? active.route : null),
              ),
              onReselect: () => unawaited(_openMore(selected: active.route)),
            ),
          ],
        ),
        FinancePermissionScope(child: widget.child),
      ],
    );
  }
}

Widget financeMoreFallback(BuildContext context, GoRouterState state) =>
    const FinanceDockRegistration(
      location: Routes.financeMore,
      openMoreOnEntry: true,
      child: SizedBox.shrink(),
    );

String _more(AppLocalizations l10n) => l10n.navMore;
String _label(AppLocalizations l10n) => l10n.navFinance;
String _overview(AppLocalizations l10n) => l10n.financeOverviewLabel;
String _transactions(AppLocalizations l10n) => l10n.financeTransactions;
String _wallets(AppLocalizations l10n) => l10n.financeWallets;
String _budgets(AppLocalizations l10n) => l10n.financeBudgets;
String _billSplits(AppLocalizations l10n) => l10n.financeBillSplits;
String _categories(AppLocalizations l10n) => l10n.financeCategories;
String _checkpoints(AppLocalizations l10n) => l10n.financeCheckpointsShortLabel;
String _analytics(AppLocalizations l10n) => l10n.financeAnalytics;
String _debts(AppLocalizations l10n) => l10n.financeDebts;
String _promotions(AppLocalizations l10n) => l10n.financePromotions;
Widget _page(BuildContext context) => const FinanceDockRegistration(
  location: Routes.finance,
  child: FinancePage(),
);
