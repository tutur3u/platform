import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/utils/wallet_ordering.dart';
import 'package:mobile/features/finance/view/finance_invoices_sheet.dart';
import 'package:mobile/features/finance/view/finance_reports_sheet.dart';
import 'package:mobile/features/finance/view/recurring_transactions_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Finance tools that open as sheets from the Finance More menu rather than
/// as their own dock destination. Each keeps a deep link.
enum FinanceMoreAction {
  invoices(Routes.financeInvoices, LucideIcons.receipt, 'view_invoices'),
  reports(
    Routes.financeReports,
    LucideIcons.chartNoAxesColumn,
    'view_finance_stats',
  ),
  recurring(Routes.financeRecurring, LucideIcons.repeat, null);

  const FinanceMoreAction(this.route, this.icon, this.permission);

  final String route;
  final IconData icon;

  /// Workspace permission the tool needs; null when everyone can open it.
  final String? permission;

  String label(AppLocalizations l10n) => switch (this) {
    FinanceMoreAction.invoices => l10n.financeInvoices,
    FinanceMoreAction.reports => l10n.financeReports,
    FinanceMoreAction.recurring => l10n.financeRecurring,
  };

  bool allowed(BuildContext context) =>
      permission == null ||
      canManageFinance(context, permission!, listen: false);

  static FinanceMoreAction? forRoute(String? route) {
    for (final action in values) {
      if (action.route == route) return action;
    }
    return null;
  }
}

/// Loads what [action]'s sheet needs from the cached Finance reads, then
/// opens it. Failures and missing wallets surface as a toast instead of a
/// silent no-op.
Future<void> openFinanceMoreAction(
  BuildContext context,
  FinanceMoreAction action,
) async {
  final l10n = context.l10n;
  final workspace = context.read<WorkspaceCubit>();
  final wsId = workspace.state.currentWorkspace?.id;
  if (wsId == null) return;
  if (!financeGrantsReady(context, listen: false)) {
    showAppToast(
      context,
      message: l10n.financeMoreLoadFailed,
      variant: AppAlertVariant.destructive,
    );
    return;
  }
  if (!action.allowed(context)) {
    showAppToast(context, message: l10n.financeNoAccessBody);
    return;
  }
  final repository = context.read<FinanceRepository>();
  // The reads belong to [wsId]; any switch while they run drops them, even
  // one that returns to the same workspace.
  var switched = false;
  final switches = workspace.stream.listen((state) {
    if (state.currentWorkspace?.id != wsId) switched = true;
  });
  bool current() =>
      !switched &&
      workspace.state.currentWorkspace?.id == wsId &&
      action.allowed(context);
  try {
    if (action == FinanceMoreAction.recurring) {
      final currency = await repository.getWorkspaceDefaultCurrency(wsId);
      if (!context.mounted || !current()) return;
      return await openRecurringTransactionsSheet(context, currency: currency);
    }
    final (loaded, currency, rates) = await (
      repository.getWallets(wsId),
      repository.getWorkspaceDefaultCurrency(wsId),
      // Rates order wallets and convert cross-wallet reports; an outage must
      // not block the tool.
      repository.getExchangeRates().then<List<ExchangeRate>>(
        (rates) => rates,
        onError: (Object _) => const <ExchangeRate>[],
      ),
    ).wait;
    if (!context.mounted || !current()) return;
    // The same order as Overview, so each tool starts on the same wallet.
    final wallets = sortWalletsForDisplay(
      wallets: loaded,
      workspaceCurrency: currency,
      exchangeRates: rates,
    );
    switch (action) {
      case FinanceMoreAction.invoices:
        await openFinanceInvoices(
          context,
          wallets: wallets,
          currency: currency,
        );
      case FinanceMoreAction.reports:
        if (wallets.isEmpty) {
          showAppToast(context, message: l10n.financeReportsNeedWallet);
          return;
        }
        await openFinanceReports(
          context,
          wallets: wallets,
          currency: currency,
          exchangeRates: rates,
        );
      case FinanceMoreAction.recurring:
        break;
    }
  } on Object {
    if (!context.mounted || switched) return;
    showAppToast(
      context,
      message: l10n.financeMoreLoadFailed,
      variant: AppAlertVariant.destructive,
    );
  } finally {
    unawaited(switches.cancel());
  }
}
