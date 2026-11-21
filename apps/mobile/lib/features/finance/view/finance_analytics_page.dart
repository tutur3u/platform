import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/models/finance/finance_analytics.dart';
import 'package:mobile/data/repositories/finance_analytics_repository.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/widgets/finance_analytics_widgets.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_period_bar.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Workspace analytics for a week, month or year: closing balance against
/// the opening one, income and expense per interval, the balance trend and
/// totals per category. Opens on the current month.
class FinanceAnalyticsPage extends StatelessWidget {
  const FinanceAnalyticsPage({
    this.repository,
    this.financeRepository,
    this.now,
    this.timezone,
    super.key,
  });

  /// Injected in tests; the page builds its own otherwise.
  final FinanceAnalyticsRepository? repository;
  final FinanceRepository? financeRepository;
  final DateTime? now;
  final String? timezone;

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellTitleOverride(
          ownerId: 'finance-analytics',
          locations: const {Routes.financeAnalytics},
          title: context.l10n.financeAnalytics,
          showLeadingBrand: false,
          showAvatar: false,
        ),
        ShellChromeActions(
          ownerId: 'finance-analytics',
          locations: const {Routes.financeAnalytics},
          actions: [
            financeAmountVisibilityAction(
              context,
              showAmounts: financeAmountsVisible(context),
              id: 'finance-analytics-amount-visibility',
            ),
          ],
        ),
        if (workspace != null)
          _AnalyticsView(
            key: ValueKey(workspace),
            workspace: workspace,
            repository: repository ?? FinanceAnalyticsRepository(),
            financeRepository: financeRepository ?? FinanceRepository(),
            now: now ?? DateTime.now(),
            timezone: timezone,
          ),
      ],
    );
  }
}

class _AnalyticsView extends StatefulWidget {
  const _AnalyticsView({
    required this.workspace,
    required this.repository,
    required this.financeRepository,
    required this.now,
    this.timezone,
    super.key,
  });

  final String workspace;
  final FinanceAnalyticsRepository repository;
  final FinanceRepository financeRepository;
  final DateTime now;
  final String? timezone;

  @override
  State<_AnalyticsView> createState() => _AnalyticsViewState();
}

class _AnalyticsViewState extends State<_AnalyticsView> {
  late FinancePeriod _period = FinancePeriod.containing(
    FinancePeriodKind.month,
    widget.now,
  );
  FinanceIncomeExpenseSummary? _summary;
  List<FinanceBalancePoint> _trend = const [];
  List<FinanceCategoryTotal>? _categories;
  String _currency = 'USD';
  bool _income = false;
  FinanceProblem? _problem;
  Object? _failure;
  int _request = 0;
  int _categoryRequest = 0;

  DateTime get _last => _period.end.subtract(const Duration(days: 1));

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  static Object _rootFailure(Object error) => switch (error) {
    ParallelWaitError(
      errors: (final AsyncError? a, final AsyncError? b, final AsyncError? c),
    ) =>
      (a ?? b ?? c)?.error ?? error,
    _ => error,
  };

  FinanceProblem _classify(Object error) => switch (_rootFailure(error)) {
    ApiException(statusCode: 403) => FinanceProblem.forbidden,
    final Object failure when isOfflineTransportFailure(failure) =>
      FinanceProblem.offline,
    _ => FinanceProblem.error,
  };

  Future<String> _timezone() async =>
      widget.timezone ?? await getCurrentTimezoneIdentifier();

  Future<void> _load({bool force = false}) async {
    final request = ++_request;
    final ws = widget.workspace;
    final period = _period;
    final last = _last;
    try {
      final (summary, trend, currency) = await (
        widget.repository.incomeExpense(
          ws,
          start: period.start,
          last: last,
          monthly: period.kind == FinancePeriodKind.year,
          forceRefresh: force,
        ),
        widget.repository.balanceTrend(
          ws,
          start: period.start,
          last: last,
          forceRefresh: force,
        ),
        widget.financeRepository.getWorkspaceDefaultCurrency(ws),
      ).wait;
      if (!mounted || request != _request) return;
      setState(() {
        _summary = summary;
        _trend = trend;
        _currency = currency;
        _problem = null;
        _failure = null;
      });
      await _loadCategories(force: force);
    } on Object catch (error) {
      if (!mounted || request != _request) return;
      setState(() {
        _failure = _rootFailure(error);
        _problem = _classify(error);
      });
    }
  }

  Future<void> _loadCategories({bool force = false}) async {
    final request = ++_categoryRequest;
    setState(() => _categories = null);
    try {
      final totals = await widget.repository.categoryTotals(
        widget.workspace,
        start: _period.start,
        last: _last,
        income: _income,
        timezone: await _timezone(),
        forceRefresh: force,
      );
      if (mounted && request == _categoryRequest) {
        setState(() => _categories = totals);
      }
    } on Object {
      if (mounted && request == _categoryRequest) {
        setState(() => _categories = const []);
      }
    }
  }

  void _setPeriod(FinancePeriod period) {
    setState(() {
      _period = period;
      _summary = null;
      _trend = const [];
    });
    unawaited(_load());
  }

  @override
  Widget build(BuildContext context) {
    final summary = _summary;
    final problem = _problem;
    if (problem != null && summary == null) {
      return FinanceProblemView(
        problem: problem,
        message: financeAnalyticsFailureMessage(context.l10n, _failure),
        onRetry: problem == FinanceProblem.forbidden
            ? null
            : () => unawaited(_load(force: true)),
      );
    }
    return NovaRefreshIndicator(
      onRefresh: () => _load(force: true),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverAppPage(
            includeBottom: false,
            sliver: SliverPersistentHeader(
              pinned: true,
              delegate: FinancePinnedHeaderDelegate(
                extent: financePeriodBarExtent(context),
                child: FinancePeriodBar(
                  key: const ValueKey('finance-analytics-period'),
                  period: _period,
                  now: widget.now,
                  onChanged: _setPeriod,
                ),
              ),
            ),
          ),
          SliverAppPage(
            includeTop: false,
            sliver: SliverList.list(
              children: [
                if (summary == null)
                  const AppSkeletonRows(count: 4)
                else ...[
                  FinanceBalanceHero(summary: summary, currency: _currency),
                  const SizedBox(height: AppLayout.itemGap),
                  FinanceAnalyticsFlow(
                    summary: summary,
                    period: _period,
                    currency: _currency,
                    now: widget.now,
                  ),
                  const SizedBox(height: AppLayout.itemGap),
                  FinanceBalanceTrendCard(points: _trend, currency: _currency),
                  const SizedBox(height: AppLayout.sectionGap),
                  FinanceCategoryBreakdownCard(
                    totals: _categories ?? const [],
                    loading: _categories == null,
                    income: _income,
                    currency: _currency,
                    onIncomeChanged: (income) {
                      setState(() => _income = income);
                      unawaited(_loadCategories());
                    },
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// What went wrong with an analytics read, in words that say what to do.
String financeAnalyticsFailureMessage(AppLocalizations l10n, Object? failure) =>
    switch (failure) {
      ApiException(statusCode: 401) => l10n.financeAnalyticsErrorSession,
      ApiException(statusCode: 400 || 404 || 422) =>
        l10n.financeAnalyticsErrorRequest,
      ApiException(statusCode: final int status)
          when status == 429 || status >= 500 =>
        l10n.financeAnalyticsErrorServer,
      _ => l10n.financeAnalyticsErrorUnknown,
    };
