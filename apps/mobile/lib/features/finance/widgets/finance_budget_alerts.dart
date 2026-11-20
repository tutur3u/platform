import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// One banner for budgets over or close to their limit: destructive while
/// any is over, a warning otherwise, naming up to three of them. Shows
/// nothing while loading, on failure or when every budget is healthy.
class FinanceBudgetAlerts extends StatefulWidget {
  const FinanceBudgetAlerts({
    required this.workspaceId,
    required this.repository,
    this.revision = 0,
    super.key,
  });

  final String workspaceId;
  final FinanceRepository repository;

  /// Bump to reload, for example after a pull to refresh.
  final int revision;

  @override
  State<FinanceBudgetAlerts> createState() => _FinanceBudgetAlertsState();
}

class _FinanceBudgetAlertsState extends State<FinanceBudgetAlerts> {
  List<FinanceBudgetStatus> _alerts = const [];
  int _request = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(FinanceBudgetAlerts oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.revision != widget.revision) {
      unawaited(_load(force: oldWidget.workspaceId == widget.workspaceId));
    }
  }

  Future<void> _load({bool force = false}) async {
    final request = ++_request;
    try {
      final alerts = await widget.repository.getBudgetStatus(
        widget.workspaceId,
        forceRefresh: force,
      );
      if (mounted && request == _request) setState(() => _alerts = alerts);
    } on Object {
      if (mounted && request == _request) setState(() => _alerts = const []);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_alerts.isEmpty) return const SizedBox.shrink();
    final l10n = context.l10n;
    final over = _alerts.where((alert) => alert.isOverBudget).toList();
    final shown = [...over, ..._alerts.where((alert) => !alert.isOverBudget)];
    final visible = financeAmountsVisible(context);
    return AppAlert(
      key: const ValueKey('finance-budget-alerts'),
      variant: over.isEmpty
          ? AppAlertVariant.warning
          : AppAlertVariant.destructive,
      title: Text(
        over.isEmpty
            ? l10n.financeBudgetAlertNear(_alerts.length)
            : l10n.financeBudgetAlertOver(over.length),
      ),
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final alert in shown.take(3))
            Text(
              visible
                  ? l10n.financeBudgetAlertUsed(
                      alert.name,
                      alert.percentageUsed.round().toString(),
                    )
                  : alert.name,
            ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: AppButton.outline(
              size: AppButtonSize.small,
              onPressed: () => context.go(Routes.financeBudgets),
              child: Text(l10n.financeBudgetAlertView),
            ),
          ),
        ],
      ),
    );
  }
}
