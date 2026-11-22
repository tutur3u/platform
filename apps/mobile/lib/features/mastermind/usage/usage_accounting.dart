import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/usage/fleet_usage.dart';
import 'package:mobile/l10n/l10n.dart';

class UsageAccounting extends StatefulWidget {
  const UsageAccounting({
    required this.machines,
    required this.provider,
    super.key,
  });

  final List<UsageMachine> machines;
  final String provider;

  @override
  State<UsageAccounting> createState() => _UsageAccountingState();
}

class _UsageAccountingState extends State<UsageAccounting> {
  static const int _pageSize = 20;
  int _page = 0;

  @override
  void didUpdateWidget(covariant UsageAccounting oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.provider != widget.provider ||
        oldWidget.machines.map((m) => m.id).join() !=
            widget.machines.map((m) => m.id).join()) {
      _page = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final now = DateTime.now().toUtc();
    final machines = widget.machines;
    final rows = [
      for (final machine in machines)
        for (final bucket in machine.buckets)
          if (widget.provider.isEmpty || bucket.provider == widget.provider)
            (machine: machine, bucket: bucket),
    ];
    final byDay = <String, double>{};
    final byModel = <String, double>{};
    final byAccount = <(String?, String?, String?), MapEntry<String, double>>{};
    for (final row in rows) {
      final bucket = row.bucket;
      final cost = bucket.cost;
      if (cost == null) continue;
      final account = row.machine.accounts
          .where((a) => a.id == bucket.accountId)
          .firstOrNull;
      final label =
          account?.email ??
          (account == null
              ? l10n.mastermindUsageUnattributed
              : '${row.machine.label} · ${account.provider} · '
                    '${account.instance}');
      final key = account?.email == null
          ? (null, account == null ? null : row.machine.id, account?.id)
          : (account?.email, null, null);
      byDay.update(bucket.day, (value) => value + cost, ifAbsent: () => cost);
      byModel.update(
        '${bucket.provider} · ${bucket.model}',
        (value) => value + cost,
        ifAbsent: () => cost,
      );
      byAccount[key] = MapEntry(label, (byAccount[key]?.value ?? 0) + cost);
    }
    final gaps = _accountingGaps(l10n, machines, rows, now);
    final count = NumberFormat.decimalPattern(l10n.localeName);
    final lastPage = rows.isEmpty ? 0 : (rows.length - 1) ~/ _pageSize;
    final page = _page.clamp(0, lastPage);
    final visible = rows.skip(page * _pageSize).take(_pageSize);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (gaps.isNotEmpty) ...[
          Text(l10n.mastermindUsagePartial),
          for (final gap in gaps) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(gap),
          ],
          const SizedBox(height: AppSpacing.md),
        ],
        _CostPanel(
          label: l10n.mastermindUsageCostByDay,
          totals: byDay.entries,
          newestFirst: true,
        ),
        const SizedBox(height: AppSpacing.md),
        _CostPanel(
          label: l10n.mastermindUsageCostByAccount,
          totals: byAccount.values,
        ),
        const SizedBox(height: AppSpacing.md),
        _CostPanel(
          label: l10n.mastermindUsageCostByModel,
          totals: byModel.entries,
        ),
        const SizedBox(height: AppSpacing.md),
        AppPanel(
          title: l10n.mastermindUsageTokens,
          child: rows.isEmpty
              ? Text(l10n.mastermindUsageMissing)
              : Column(
                  children: [
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: DataTable(
                        columns: [
                          for (final label in [
                            l10n.mastermindUsageMachine,
                            l10n.mastermindUsageDay,
                            l10n.mastermindUsageModel,
                            l10n.mastermindUsageInput,
                            l10n.mastermindUsageCacheRead,
                            l10n.mastermindUsageCacheWrite,
                            l10n.mastermindUsageOutput,
                          ])
                            DataColumn(label: Text(label)),
                        ],
                        rows: [
                          for (final row in visible)
                            DataRow(
                              cells: [
                                DataCell(Text(row.machine.label)),
                                DataCell(Text(row.bucket.day)),
                                DataCell(
                                  Text(
                                    '${row.bucket.provider} · '
                                    '${row.bucket.model}',
                                  ),
                                ),
                                DataCell(Text(count.format(row.bucket.input))),
                                DataCell(
                                  Text(count.format(row.bucket.cacheRead)),
                                ),
                                DataCell(
                                  Text(count.format(row.bucket.cacheWrite)),
                                ),
                                DataCell(Text(count.format(row.bucket.output))),
                              ],
                            ),
                        ],
                      ),
                    ),
                    if (lastPage > 0)
                      Wrap(
                        spacing: AppSpacing.sm,
                        children: [
                          AppButton.outline(
                            onPressed: page == 0
                                ? null
                                : () => setState(() => _page = page - 1),
                            child: Text(l10n.mastermindUsagePrevious),
                          ),
                          AppButton.outline(
                            onPressed: page >= lastPage
                                ? null
                                : () => setState(() => _page = page + 1),
                            child: Text(l10n.mastermindUsageNext),
                          ),
                        ],
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

/// Names each machine and price gap behind partial totals, in display order.
List<String> _accountingGaps(
  AppLocalizations l10n,
  List<UsageMachine> machines,
  Iterable<({UsageMachine machine, UsageBucket bucket})> rows,
  DateTime now,
) {
  String names(bool Function(UsageMachine) test) =>
      machines.where(test).map((machine) => machine.label).join(', ');
  final unread = names((m) => m.accounting.kind == 'unavailable');
  final partial = names((m) => m.accounting.kind == 'partial');
  final stale = names((m) {
    final observedAt = m.accounting.observedAt;
    return m.accounting.kind != 'unavailable' &&
        (observedAt == null || now.difference(observedAt) > usageStaleAfter);
  });
  final unpriced = rows.fold<int>(
    0,
    (total, row) =>
        total +
        (row.bucket.unpriced > 0
            ? row.bucket.unpriced
            : (row.bucket.cost == null ? 1 : 0)),
  );
  return [
    if (unread.isNotEmpty) l10n.mastermindUsagePartialUnread(unread),
    if (partial.isNotEmpty) l10n.mastermindUsagePartialSources(partial),
    if (stale.isNotEmpty) l10n.mastermindUsagePartialStale(stale),
    if (unpriced > 0) l10n.mastermindUsageUnpricedRecords(unpriced),
  ];
}

class _CostPanel extends StatelessWidget {
  const _CostPanel({
    required this.label,
    required this.totals,
    this.newestFirst = false,
  });

  final String label;
  final Iterable<MapEntry<String, double>> totals;
  final bool newestFirst;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final currency = NumberFormat.simpleCurrency(
      locale: l10n.localeName,
      name: 'USD',
    );
    final rows = totals.toList()
      ..sort(
        (a, b) =>
            newestFirst ? b.key.compareTo(a.key) : b.value.compareTo(a.value),
      );
    final max = rows.fold<double>(
      0,
      (max, row) => row.value > max ? row.value : max,
    );
    return AppPanel(
      title: label,
      child: rows.isEmpty
          ? Text(l10n.mastermindUsageMissing)
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final row in rows) ...[
                  Text('${row.key} · ${currency.format(row.value)}'),
                  if (max > 0)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        vertical: AppSpacing.xs,
                      ),
                      child: AppMeter(
                        value: row.value / max,
                        semanticLabel: row.key,
                      ),
                    ),
                ],
              ],
            ),
    );
  }
}
