import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/view/finance_more_actions.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

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
    // More tool deep links keep the More button selected.
    aliasRoutes: [
      Routes.financeMore,
      Routes.financeInvoices,
      Routes.financeReports,
      Routes.financeRecurring,
    ],
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
      Routes.financeInvoices,
      Routes.financeReports,
      Routes.financeRecurring,
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
    this.openActionOnEntry,
    this.detailBackRoute,
    super.key,
  });

  final String location;
  final Widget child;
  final bool openMoreOnEntry;

  /// Opens this More tool once on entry, then lands on the overview. Backs
  /// the tool's deep link.
  final FinanceMoreAction? openActionOnEntry;
  final String? detailBackRoute;

  @override
  State<FinanceDockRegistration> createState() =>
      _FinanceDockRegistrationState();
}

class _FinanceDockRegistrationState extends State<FinanceDockRegistration> {
  /// Context below the permission scope and the Finance repository that
  /// More tools open their sheets from.
  final GlobalKey _toolsKey = GlobalKey();

  /// Whether finance grants have settled; menus and tools wait for it so a
  /// tool the person can use is never hidden or refused while they load.
  final _grantsReady = ValueNotifier<bool>(false);
  bool _enteredOnce = false;

  Timer? _entryFallback;

  /// The workspace a deep-linked tool entered in.
  _WorkspaceFence? _entryFence;

  int _entryGeneration = 0;

  @override
  void initState() {
    super.initState();
    if (widget.openActionOnEntry != null || widget.openMoreOnEntry) {
      _startEntry();
    }
  }

  /// Starts (or, after a workspace switch, restarts) the deep-linked entry.
  /// A repeat link to the same tool reuses this route, and its workspace is
  /// selected before navigation, so the entry follows the current workspace
  /// while the tool's own reads stay fenced to theirs.
  void _startEntry() {
    _entryGeneration++;
    _enteredOnce = false;
    _entryFence?.cancel();
    _entryFence = widget.openActionOnEntry == null
        ? null
        : _WorkspaceFence(
            context.read<WorkspaceCubit>(),
            onSwitch: () {
              if (mounted) _startEntry();
            },
          );
    _entryFallback?.cancel();
    // Grants that never settle still open the entry, which then explains.
    _entryFallback = Timer(_grantsDeadline, _enter);
    // A restart follows a workspace switch, whose grants reload; the next
    // ready report from the permission scope opens the entry.
    if (_entryGeneration > 1) _grantsReady.value = false;
  }

  static const _grantsDeadline = Duration(seconds: 15);

  void _grantsChanged(bool ready) {
    _grantsReady.value = ready;
    if (ready) _enter();
  }

  void _enter() {
    if (!mounted || _enteredOnce) return;
    _enteredOnce = true;
    _entryFallback?.cancel();
    final action = widget.openActionOnEntry;
    if (action != null) {
      // The entry already waited for grants, up to the deadline.
      unawaited(
        _openAction(
          action,
          fence: _entryFence,
          waitForGrants: false,
          entry: _entryGeneration,
        ),
      );
    } else if (widget.openMoreOnEntry) {
      unawaited(_openMore(fallback: true));
    }
  }

  Future<void> _awaitGrants() async {
    if (_grantsReady.value) return;
    final settled = Completer<void>();
    void listener() {
      if (_grantsReady.value && !settled.isCompleted) settled.complete();
    }

    _grantsReady.addListener(listener);
    try {
      await settled.future.timeout(_grantsDeadline, onTimeout: () {});
    } finally {
      if (mounted) _grantsReady.removeListener(listener);
    }
  }

  @override
  void dispose() {
    _entryFallback?.cancel();
    _entryFence?.cancel();
    _grantsReady.dispose();
    super.dispose();
  }

  /// Opens [action] in the workspace it was chosen or linked in ([fence]); a
  /// switch while grants load drops it.
  Future<void> _openAction(
    FinanceMoreAction action, {
    _WorkspaceFence? fence,
    bool waitForGrants = true,
    int? entry,
  }) async {
    final scope = fence ?? _WorkspaceFence(context.read<WorkspaceCubit>());
    try {
      if (waitForGrants) await _awaitGrants();
    } finally {
      if (entry == null) scope.cancel();
    }
    if (!mounted) return;
    final tools = _toolsKey.currentContext;
    if (!scope.switched && tools != null && tools.mounted) {
      await openFinanceMoreAction(tools, action);
    }
    // A switched entry restarts for the new workspace instead of landing.
    if (mounted &&
        widget.openActionOnEntry != null &&
        (entry == null || (entry == _entryGeneration && !scope.switched))) {
      _entryFence?.cancel();
      context.go(Routes.finance);
    }
  }

  Future<void> _openMore({String? selected, bool fallback = false}) async {
    final l10n = context.l10n;
    final tools = _toolsKey.currentContext;
    // Until grants settle every tool is listed; the chosen one waits for them
    // and explains a missing grant.
    final actions = [
      if (tools != null)
        for (final action in FinanceMoreAction.values)
          if (!_grantsReady.value || action.allowed(tools)) action,
    ];
    final route = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.navMore,
      selected: selected,
      choices: [
        for (final item in financeExtraNavItems) ...[
          AppSheetChoice(
            value: item.route,
            label: item.label(l10n),
            icon: item.icon,
          ),
          if (item.route == Routes.financeAnalytics)
            for (final action in actions)
              AppSheetChoice(
                value: action.route,
                label: action.label(l10n),
                icon: action.icon,
              ),
        ],
      ],
    );
    if (!mounted) return;
    if (FinanceMoreAction.forRoute(route) case final action?) {
      await _openAction(action);
      if (mounted && fallback) context.go(Routes.finance);
      return;
    }
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
        FinancePermissionScope(
          child: RepositoryProvider(
            create: (_) => FinanceRepository(),
            child: FinanceGrantsReady(
              onChanged: _grantsChanged,
              child: KeyedSubtree(key: _toolsKey, child: widget.child),
            ),
          ),
        ),
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

/// Notes any workspace switch away from the workspace current at creation.
class _WorkspaceFence {
  _WorkspaceFence(WorkspaceCubit workspace, {VoidCallback? onSwitch})
    : _id = workspace.state.currentWorkspace?.id {
    _subscription = workspace.stream.listen((state) {
      if (switched || state.currentWorkspace?.id == _id) return;
      switched = true;
      onSwitch?.call();
    });
  }

  final String? _id;
  late final StreamSubscription<Object?> _subscription;
  bool switched = false;

  void cancel() => unawaited(_subscription.cancel());
}

/// Deep link to a More tool: opens its sheet, then lands on the overview.
GoRouterWidgetBuilder financeMoreActionRoute(FinanceMoreAction action) =>
    (context, state) => FinanceDockRegistration(
      location: action.route,
      openActionOnEntry: action,
      child: const Center(child: NovaLoadingIndicator()),
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
