import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/utils/finance_report.dart';
import 'package:mobile/features/finance/widgets/finance_flow_summary.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_period_bar.dart';
import 'package:mobile/features/finance/widgets/finance_period_bars.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> openFinanceReports(
  BuildContext context, {
  required List<Wallet> wallets,
  required String currency,
}) async {
  if (wallets.isEmpty) return;
  final repository = context.read<FinanceRepository>();
  final session = FinanceSheetSession(context);
  await session.run(
    (_) => _FinanceReportsSheet(
      wallets: wallets,
      currency: currency,
      repository: repository,
      session: session,
    ),
  );
}

class _FinanceReportsSheet extends StatefulWidget {
  const _FinanceReportsSheet({
    required this.wallets,
    required this.currency,
    required this.repository,
    required this.session,
  });

  final List<Wallet> wallets;
  final String currency;
  final FinanceRepository repository;
  final FinanceSheetSession session;

  @override
  State<_FinanceReportsSheet> createState() => _FinanceReportsSheetState();
}

class _FinanceReportsSheetState extends State<_FinanceReportsSheet> {
  late Wallet _wallet = widget.wallets.first;
  final _now = DateTime.now();
  late FinancePeriod _period = FinancePeriod.containing(
    FinancePeriodKind.month,
    _now,
  );
  int _generation = 0;
  late Future<FinanceWalletReport> _report = _load();

  Future<FinanceWalletReport> _load() async {
    final period = _period;
    final generation = ++_generation;
    final rows = await widget.repository.getReportTransactions(
      workspace: widget.session.workspaceId,
      wallet: _wallet.id,
      query: period.query,
      active: () =>
          mounted && widget.session.active && generation == _generation,
    );
    return FinanceWalletReport(period, rows);
  }

  void _reload() => setState(() => _report = _load());

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final currency = _wallet.currency ?? widget.currency;
    return AppSheetScaffold(
      title: l10n.financeReports,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          AppSelect<Wallet>(
            title: l10n.financeWallet,
            options: [
              for (final wallet in widget.wallets)
                AppSelectOption(value: wallet, label: wallet.name ?? wallet.id),
            ],
            value: _wallet,
            onChanged: (wallet) {
              if (!mounted) return;
              _wallet = wallet;
              _reload();
            },
          ),
          FinancePeriodBar(
            period: _period,
            now: _now,
            onChanged: (period) {
              _period = period;
              _reload();
            },
          ),
          FutureBuilder<FinanceWalletReport>(
            future: _report,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const AppLoadingIndicator();
              }
              final report = snapshot.data;
              if (report == null) {
                return AppStateMessage.inline(
                  icon: LucideIcons.circleAlert,
                  title: l10n.financeReportUnavailable,
                  actionLabel: l10n.commonRetry,
                  onAction: _reload,
                );
              }
              if (!report.hasRows) {
                return AppStateMessage.inline(
                  icon: LucideIcons.chartNoAxesColumn,
                  title: l10n.financeNoTransactionsInPeriod(
                    _period.label(l10n.localeName),
                  ),
                );
              }
              return _ReportBody(
                report: report,
                period: _period,
                currency: currency,
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ReportBody extends StatelessWidget {
  const _ReportBody({
    required this.report,
    required this.period,
    required this.currency,
  });

  final FinanceWalletReport report;
  final FinancePeriod period;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final show = financeAmountsVisible(context);
    final movement = report.movement;
    final points = [
      for (var i = 0; i < movement.length; i++)
        ChartPoint(
          t: period.kind == FinancePeriodKind.year
              ? DateTime(period.start.year, i + 1)
              : DateTime(
                  period.start.year,
                  period.start.month,
                  period.start.day + i,
                ),
          y: movement[i],
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.md,
      children: [
        FinanceFlowSummary(
          income: report.income,
          expense: -report.expense,
          currency: currency,
          chart: show
              ? FinancePeriodBars(
                  income: report.buckets.income,
                  expense: report.buckets.expense,
                )
              : null,
        ),
        if (show)
          AppGroupedCard(
            children: [
              AppRichRow(
                title: l10n.financeReportNetMovement,
                subtitle: DateFormat.yMMMd(
                  l10n.localeName,
                ).format(period.start),
                trailing: FinanceAmountText(movement.last, currency),
              ),
              Sparkline(
                series: ChartSeries(
                  id: 'movement',
                  label: l10n.financeReportNetMovement,
                  slot: 0,
                  points: points,
                ),
                summary: l10n.financeReportNetMovement,
                axis: ChartValueAxis.auto(movement, signed: true),
              ),
            ],
          ),
        for (final (label, values) in [
          (l10n.financeIncome, report.incomeCategories),
          (l10n.financeExpense, report.expenseCategories),
        ])
          if (values.isNotEmpty)
            AppGroupedCard(
              children: [
                AppRichRow(title: l10n.financeReportByCategory(label)),
                for (final category in values)
                  AppRichRow(
                    title: category.name ?? l10n.financeReportUncategorized,
                    trailing: FinanceAmountText(category.amount, currency),
                  ),
              ],
            ),
      ],
    );
  }
}
