import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_line.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/usage/fleet_usage.dart';
import 'package:mobile/features/mastermind/usage/usage_accounting.dart';
import 'package:mobile/features/mastermind/usage/usage_reasons.dart';
import 'package:mobile/l10n/l10n.dart';

class UsageContent extends StatefulWidget {
  const UsageContent({
    required this.usage,
    this.refreshFailed = false,
    super.key,
  });

  final FleetUsage usage;
  final bool refreshFailed;

  @override
  State<UsageContent> createState() => _UsageContentState();
}

class _UsageContentState extends State<UsageContent> {
  static const _all = '';
  String _machine = _all;
  String _provider = _all;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final machines = widget.usage.machines;
    final freshness = FleetReceiptFreshnessLine(
      receivedAt: widget.usage.receivedAt,
      failed: widget.refreshFailed,
      staleLabel: (l10n, age) => l10n.mastermindUsageLastReceived(age),
    );
    if (machines.isEmpty) {
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverList.list(
            children: [freshness, Text(l10n.mastermindUsageEmpty)],
          ),
        ],
      );
    }
    final providers = {
      for (final machine in machines) ...[
        for (final account in machine.accounts) account.provider,
        for (final bucket in machine.buckets) bucket.provider,
      ],
    }.toList()..sort();
    final filtered = machines
        .where((machine) => _machine == _all || machine.id == _machine)
        .toList();
    bool matches(String provider) => _provider == _all || provider == _provider;
    final accounts = [
      for (final machine in filtered)
        for (final account in machine.accounts.where(
          (a) => matches(a.provider),
        ))
          (machine: machine, account: account),
    ];
    return AppPageScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverList.list(
          children: [
            freshness,
            AppAdaptiveGrid(
              minTileWidth: 140,
              equalHeight: true,
              children: [
                AppSelect<String>(
                  options: [
                    AppSelectOption(
                      value: _all,
                      label: l10n.mastermindUsageAllMachines,
                    ),
                    for (final machine in machines)
                      AppSelectOption(value: machine.id, label: machine.label),
                  ],
                  value: _machine,
                  title: l10n.mastermindUsageMachine,
                  onChanged: (value) => setState(() => _machine = value),
                ),
                AppSelect<String>(
                  options: [
                    AppSelectOption(
                      value: _all,
                      label: l10n.mastermindUsageAllProviders,
                    ),
                    for (final provider in providers)
                      AppSelectOption(value: provider, label: provider),
                  ],
                  value: _provider,
                  title: l10n.mastermindUsageProvider,
                  onChanged: (value) => setState(() => _provider = value),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            FleetClock(
              period: const Duration(seconds: 3),
              builder: (context, now) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppPanel(
                    title: l10n.mastermindUsageReadiness,
                    padded: false,
                    child: Column(
                      children: [
                        for (final machine in filtered)
                          _ReadinessRow(
                            machine: machine,
                            accounts: machine.accounts.where(
                              (account) => matches(account.provider),
                            ),
                            now: now,
                          ),
                      ],
                    ),
                  ),
                  for (final row in accounts) ...[
                    const SizedBox(height: AppSpacing.md),
                    _AccountPanel(
                      machine: row.machine,
                      account: row.account,
                      now: now,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            UsageAccounting(machines: filtered, provider: _provider),
          ],
        ),
      ],
    );
  }
}

bool _stale(
  DateTime? observedAt,
  DateTime now, [
  Duration limit = usageStaleAfter,
]) => observedAt != null && now.difference(observedAt) > limit;

class _ReadinessRow extends StatelessWidget {
  const _ReadinessRow({
    required this.machine,
    required this.accounts,
    required this.now,
  });

  final UsageMachine machine;
  final Iterable<UsageAccount> accounts;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final observedAt = machine.quota.observedAt;
    final stale = _stale(observedAt, now);
    final current = observedAt != null && !stale;
    final listed = accounts.toList();
    final available = [
      for (final account in listed)
        if (current &&
            account.checkedAt != null &&
            !_stale(account.checkedAt, now, quotaCheckStaleAfter) &&
            account.status == 'available')
          account.instance,
    ];
    final subtitle = available.isNotEmpty
        ? available.join(', ')
        : machine.quota.kind == 'unavailable'
        ? usageUnreadReason(l10n, machine.quota.reason) ??
              l10n.mastermindUsageNoConfirmedQuota
        : current &&
              listed.isNotEmpty &&
              listed.every((account) => account.status != 'available')
        ? l10n.mastermindUsageNoAccountAvailable
        : l10n.mastermindUsageNoConfirmedQuota;
    return AppRichRow(
      title: machine.label,
      subtitle: subtitle,
      leading: const AppIconTile(icon: LucideIcons.server),
      trailingCaption: observedAt == null
          ? null
          : fleetAge(l10n, observedAt, now),
      trailing: stale
          ? AppBadge(
              variant: AppBadgeVariant.warning,
              child: Text(l10n.mastermindUsageStale),
            )
          : null,
    );
  }
}

class _AccountPanel extends StatelessWidget {
  const _AccountPanel({
    required this.machine,
    required this.account,
    required this.now,
  });

  final UsageMachine machine;
  final UsageAccount account;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final stale = _stale(account.checkedAt, now, quotaCheckStaleAfter);
    final (status, tone) = stale
        ? (l10n.mastermindUsageStale, AppBadgeVariant.warning)
        : switch (account.status) {
            'limited' => (
              l10n.mastermindUsageLimited,
              AppBadgeVariant.destructive,
            ),
            'available' => (
              l10n.mastermindUsageAvailable,
              AppBadgeVariant.success,
            ),
            _ => (l10n.mastermindUsageMissing, AppBadgeVariant.outline),
          };
    final reason = usageAccountReason(l10n, account.reason);
    final monthly = account.windows.any((row) => row.kind == 'monthly');
    return AppPanel(
      title: account.instance,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text([account.provider, machine.label, ?account.plan].join(' · ')),
          const SizedBox(height: AppSpacing.xs),
          Text(account.email ?? l10n.mastermindUsageEmailMissing),
          const SizedBox(height: AppSpacing.sm),
          AppBadge(variant: tone, child: Text(status)),
          if (reason != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(reason),
          ],
          for (final (kind, label) in [
            ('session', l10n.mastermindUsageSession),
            ('weekly', l10n.mastermindUsageWeekly),
            if (monthly) ('monthly', l10n.mastermindUsageMonthly),
          ]) ...[
            const SizedBox(height: AppSpacing.md),
            _UsageWindow(
              label: label,
              window: account.windows
                  .where((row) => row.kind == kind)
                  .firstOrNull,
              checkedAt: account.checkedAt,
              now: now,
            ),
          ],
        ],
      ),
    );
  }
}

class _UsageWindow extends StatelessWidget {
  const _UsageWindow({
    required this.label,
    required this.window,
    required this.checkedAt,
    required this.now,
  });

  final String label;
  final UsageWindow? window;
  final DateTime? checkedAt;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final used = window?.usedPercent;
    final reset = window?.resetsAt;
    final quota = used == null
        ? '—'
        : NumberFormat.percentPattern(l10n.localeName).format(used / 100);
    final resetDate = reset == null ? null : Gmt7.date(reset, l10n.localeName);
    final readingDate = checkedAt == null
        ? null
        : Gmt7.date(checkedAt!, l10n.localeName);
    final resetTime = reset == null
        ? null
        : DateFormat('HH:mm:ss', l10n.localeName).format(Gmt7.wallTime(reset));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$label · $quota'),
        if (used != null) ...[
          const SizedBox(height: AppSpacing.xs),
          AppMeter(value: used / 100, semanticLabel: label),
        ],
        if (reset != null) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            [
              if (resetDate == readingDate)
                '$resetTime ICT'
              else
                '$resetDate $resetTime ICT',
              if (reset.isAfter(now))
                fleetCountdown(l10n, reset.difference(now))
              else
                l10n.mastermindUsageAwaitingRefresh,
            ].join(' · '),
          ),
        ],
      ],
    );
  }
}
