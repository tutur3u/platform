import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_period_bar.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

class FinanceInvoiceReportSheet extends StatefulWidget {
  const FinanceInvoiceReportSheet({
    required this.session,
    required this.repository,
    required this.wallets,
    super.key,
  });

  final FinanceSheetSession session;
  final FinanceRepository repository;
  final List<Wallet> wallets;

  @override
  State<FinanceInvoiceReportSheet> createState() =>
      _FinanceInvoiceReportSheetState();
}

class _FinanceInvoiceReportSheetState extends State<FinanceInvoiceReportSheet> {
  final _now = DateTime.now();
  late FinancePeriod _period = FinancePeriod.containing(
    FinancePeriodKind.month,
    _now,
  );
  late Future<FinanceInvoiceReport> _report = _load();

  Future<FinanceInvoiceReport> _load() {
    final format = DateFormat('yyyy-MM-dd', 'en');
    final end = _period.end;
    return widget.repository.getInvoiceReport(
      widget.session.workspaceId,
      from: format.format(_period.start),
      through: format.format(DateTime(end.year, end.month, end.day - 1)),
      granularity: _period.kind == FinancePeriodKind.year ? 'monthly' : 'daily',
    );
  }

  void _reload() => setState(() => _report = _load());

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.financeInvoiceReports,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          FinancePeriodBar(
            period: _period,
            now: _now,
            onChanged: (period) {
              _period = period;
              _reload();
            },
          ),
          FutureBuilder(
            future: _report,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const AppSkeletonRows();
              }
              final report = snapshot.data;
              if (report == null) {
                return AppStateMessage.inline(
                  icon: LucideIcons.circleAlert,
                  tone: AppTone.destructive,
                  title: l10n.financeReportUnavailable,
                  actionLabel: l10n.commonRetry,
                  onAction: _reload,
                );
              }
              if (report.wallets.isEmpty && report.creators.isEmpty) {
                return AppStateMessage.inline(
                  icon: LucideIcons.receipt,
                  title: l10n.financeInvoiceEmpty,
                );
              }
              return _InvoiceReport(
                report: report,
                wallets: widget.wallets,
                period: _period,
              );
            },
          ),
        ],
      ),
    );
  }
}

class _InvoiceReport extends StatelessWidget {
  const _InvoiceReport({
    required this.report,
    required this.wallets,
    required this.period,
  });

  final FinanceInvoiceReport report;
  final List<Wallet> wallets;
  final FinancePeriod period;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final currencies = {
      for (final wallet in wallets) wallet.id: wallet.currency,
    };
    final byPeriod = <DateTime, int>{};
    for (final row in report.wallets) {
      byPeriod.update(
        row.period,
        (count) => count + row.count,
        ifAbsent: () => row.count,
      );
    }
    final byWallet = _totals(report.wallets);
    final byCreator = _totals(report.creators);
    final counts = [
      for (var i = 0; i < period.bucketCount; i++)
        () {
          final date = period.kind == FinancePeriodKind.year
              ? DateTime(period.start.year, i + 1)
              : DateTime(
                  period.start.year,
                  period.start.month,
                  period.start.day + i,
                );
          return ChartPoint(t: date, y: (byPeriod[date] ?? 0).toDouble());
        }(),
    ];
    final count = byPeriod.values.fold(0, (sum, count) => sum + count);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.md,
      children: [
        if (counts.isNotEmpty)
          AppGroupedCard(
            children: [
              AppRichRow(title: l10n.financeInvoiceReportCount(count)),
              Sparkline(
                series: ChartSeries(
                  id: 'invoices',
                  label: l10n.financeInvoices,
                  slot: 0,
                  points: counts,
                ),
                summary: l10n.financeInvoiceReportCount(count),
                axis: ChartValueAxis.auto(counts.map((point) => point.y)),
              ),
            ],
          ),
        if (byWallet.isNotEmpty) ...[
          AppSectionHeader(title: l10n.financeInvoiceByWallet),
          AppGroupedCard(
            children: [
              for (final row in byWallet)
                AppRichRow(
                  title: row.name,
                  subtitle: l10n.financeInvoiceReportCount(row.count),
                  trailing: currencies[row.id] == null
                      ? null
                      : FinanceAmountText(row.amount, currencies[row.id]!),
                ),
            ],
          ),
        ],
        if (byCreator.isNotEmpty) ...[
          AppSectionHeader(title: l10n.financeInvoiceByCreator),
          AppGroupedCard(
            children: [
              for (final row in byCreator)
                AppRichRow(
                  title: row.name,
                  trailingCaption: l10n.financeInvoiceReportCount(row.count),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

List<({String id, String name, double amount, int count})> _totals(
  List<FinanceInvoiceReportRow> rows,
) {
  final totals =
      <String, ({String id, String name, double amount, int count})>{};
  for (final row in rows) {
    final prior = totals[row.id];
    totals[row.id] = (
      id: row.id,
      name: row.name,
      amount: (prior?.amount ?? 0) + row.amount,
      count: (prior?.count ?? 0) + row.count,
    );
  }
  return totals.values.toList()..sort((a, b) => b.count.compareTo(a.count));
}
