import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/models/finance/wallet_interest.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/view/transaction_custom_range_sheet.dart';
import 'package:mobile/features/finance/view/wallet_interest_form.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> showWalletInterest(
  BuildContext context, {
  required String wallet,
  required String currency,
}) async {
  final repository = context.read<FinanceRepository>();
  final session = FinanceSheetSession(context);
  await session.run(
    (_) => _WalletInterestSheet(
      repository: repository,
      session: session,
      wallet: wallet,
      currency: currency,
    ),
  );
}

typedef _Snapshot = ({WalletInterest data, bool setupEnabled});

class _WalletInterestSheet extends StatefulWidget {
  const _WalletInterestSheet({
    required this.repository,
    required this.session,
    required this.wallet,
    required this.currency,
  });

  final FinanceRepository repository;
  final FinanceSheetSession session;
  final String wallet;
  final String currency;

  @override
  State<_WalletInterestSheet> createState() => _WalletInterestSheetState();
}

class _WalletInterestSheetState extends State<_WalletInterestSheet> {
  late Future<_Snapshot> _snapshot = _load();
  bool _saving = false;
  bool _unconfirmed = false;
  WalletInterestProjectionPeriod _period = WalletInterestProjectionPeriod.month;
  Future<num>? _historical;
  DateTimeRange? _historicalRange;

  String get _workspace => widget.session.workspaceId;
  bool _canWrite() => mounted && widget.session.allows('update_wallets');

  Future<_Snapshot> _load() async {
    final data = await widget.repository.getWalletInterest(
      _workspace,
      widget.wallet,
    );
    final setupEnabled =
        data.config == null &&
        widget.session.allows('update_wallets') &&
        await widget.repository.isWalletInterestSetupEnabled(_workspace);
    return (data: data, setupEnabled: setupEnabled);
  }

  void _refresh() {
    setState(() {
      _unconfirmed = false;
      _snapshot = _load();
      _historical = null;
      _historicalRange = null;
    });
  }

  Future<void> _save(Future<void> Function() operation) async {
    if (_saving || _unconfirmed || !_canWrite()) return;
    setState(() => _saving = true);
    try {
      await operation();
      if (mounted && widget.session.active) _refresh();
    } on Object {
      if (mounted) setState(() => _unconfirmed = true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _settings(WalletInterestConfig? config) async {
    final settings = await widget.session.open<InterestSettings>(
      context,
      (_) => WalletInterestForm(config: config),
    );
    if (settings == null || !mounted) return;
    final start = settings.start;
    final end = settings.end;
    final tier = settings.tier;
    if (config == null) {
      await _save(
        () => widget.repository.enableWalletInterest(
          _workspace,
          widget.wallet,
          provider: settings.provider,
          tier: tier,
          start: start == null ? null : interestDate(start),
          active: _canWrite,
        ),
      );
    } else {
      await _save(
        () =>
            widget.repository.updateWalletInterest(_workspace, widget.wallet, {
              if (tier != config.tier && tier != null)
                'zalopay_tier': tier.name,
              'tracking_start_date': start == null ? null : interestDate(start),
              'tracking_end_date': end == null ? null : interestDate(end),
            }, active: _canWrite),
      );
    }
  }

  Future<void> _addRate() async {
    final picked = await widget.session.open<({double rate, DateTime? date})>(
      context,
      (_) => const WalletInterestRateForm(),
    );
    if (picked == null || !mounted) return;
    final date = picked.date;
    await _save(
      () => widget.repository.addWalletInterestRate(
        _workspace,
        widget.wallet,
        percent: picked.rate,
        effectiveFrom: date == null ? null : interestDate(date),
        active: _canWrite,
      ),
    );
  }

  Future<void> _delete() async {
    final l10n = context.l10n;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.financeInterestRemove,
      cancelLabel: l10n.commonCancel,
      confirmLabel: l10n.commonDelete,
      message: l10n.financeInterestRemoveDescription,
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    await _save(
      () => widget.repository.deleteWalletInterest(
        _workspace,
        widget.wallet,
        active: _canWrite,
      ),
    );
  }

  Future<void> _calculate() async {
    final now = DateTime.now();
    final range = _historicalRange;
    final picked = await showTransactionDateRange(
      context,
      range == null
          ? const FinanceTransactionQuery()
          : const FinanceTransactionQuery().withDateRange(
              range.start,
              range.end,
            ),
      now,
      lastDate: DateUtils.dateOnly(now),
    );
    if (picked == null ||
        !mounted ||
        !widget.session.allows('view_transactions')) {
      return;
    }
    setState(() {
      _historicalRange = picked;
      _historical = widget.repository.getWalletHistoricalInterest(
        _workspace,
        widget.wallet,
        from: interestDate(picked.start),
        to: interestDate(picked.end),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FutureBuilder(
      future: _snapshot,
      builder: (context, snapshot) {
        final loaded = snapshot.connectionState == ConnectionState.done;
        final result = snapshot.data;
        final config = result?.data.config;
        final canWrite = loaded && _canWrite() && !_saving && !_unconfirmed;
        return AppSheetScaffold(
          title: l10n.financeWalletInterest,
          actions: [
            if (canWrite &&
                result != null &&
                config == null &&
                result.setupEnabled)
              AppButton.primary(
                onPressed: () => _settings(null),
                child: Text(l10n.financeInterestEnable),
              ),
          ],
          child: !loaded
              ? const AppSkeletonRows()
              : result == null
              ? AppStateMessage.inline(
                  icon: LucideIcons.circleAlert,
                  title: l10n.commonSomethingWentWrong,
                  actionLabel: l10n.commonRetry,
                  onAction: _refresh,
                )
              : config == null
              ? _unconfirmed
                    ? _unconfirmedMessage(context)
                    : _saving
                    ? const AppLoadingIndicator()
                    : AppStateMessage.inline(
                        icon: LucideIcons.trendingUp,
                        title: l10n.financeInterestOff,
                      )
              : _summary(context, result.data, config, canWrite),
        );
      },
    );
  }

  Widget _unconfirmedMessage(BuildContext context) => AppStateMessage.inline(
    icon: LucideIcons.circleAlert,
    title: context.l10n.financeInterestUnconfirmed,
    actionLabel: context.l10n.commonRefresh,
    onAction: _refresh,
  );

  Widget _summary(
    BuildContext context,
    WalletInterest data,
    WalletInterestConfig config,
    bool canWrite,
  ) {
    final l10n = context.l10n;
    final dates = MaterialLocalizations.of(context);
    final currentRate = data.currentRate;
    final projected = data.projection(_period);
    final history = _historical;
    Widget moneyRow(String label, num amount) => AppRichRow(
      title: label,
      trailing: FinanceAmountText(amount.toDouble(), widget.currency),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.md,
      children: [
        AppRichRow(
          title: interestProviderLabel(config.provider),
          subtitle: config.enabled ? null : l10n.financeInterestPaused,
          trailingCaption: currentRate == null
              ? null
              : l10n.financeInterestPercent(currentRate),
        ),
        if (_saving) const AppLoadingIndicator(),
        if (_unconfirmed) _unconfirmedMessage(context),
        if (config.enabled)
          AppGroupedCard(
            children: [
              if (data.today case final amount?)
                moneyRow(l10n.financeToday, amount),
              if (data.month case final amount?)
                moneyRow(l10n.financeInterestMonthToDate, amount),
              if (data.year case final amount?)
                moneyRow(l10n.financeInterestYearToDate, amount),
              if (data.total case final amount?)
                moneyRow(l10n.financeInterestTotal, amount),
            ],
          ),
        if (config.enabled && projected != null) ...[
          AppSelect<WalletInterestProjectionPeriod>(
            title: l10n.financeInterestProjection,
            options: [
              for (final period in WalletInterestProjectionPeriod.values)
                AppSelectOption(
                  value: period,
                  label: l10n.financeInterestDays(switch (period) {
                    WalletInterestProjectionPeriod.week => 7,
                    WalletInterestProjectionPeriod.month => 30,
                    WalletInterestProjectionPeriod.quarter => 90,
                    WalletInterestProjectionPeriod.year => 365,
                  }),
                ),
            ],
            value: _period,
            onChanged: (value) {
              if (mounted) setState(() => _period = value);
            },
          ),
          moneyRow(l10n.financeInterestProjection, projected),
        ],
        if (config.enabled)
          AppRichRow(
            title: l10n.financeInterestHistorical,
            subtitle: _historicalRange == null
                ? null
                : '${dates.formatCompactDate(_historicalRange!.start)} – '
                      '${dates.formatCompactDate(_historicalRange!.end)}',
            onTap: _calculate,
          ),
        if (history != null)
          FutureBuilder(
            future: history,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const AppLoadingIndicator();
              }
              final total = snapshot.data;
              return total == null
                  ? AppStateMessage.inline(
                      icon: LucideIcons.circleAlert,
                      title: l10n.commonSomethingWentWrong,
                    )
                  : moneyRow(l10n.financeInterestTotal, total);
            },
          ),
        if (data.rates.isNotEmpty) ...[
          AppSectionHeader(title: l10n.financeInterestRateHistory),
          AppGroupedCard(
            children: [
              for (final rate in data.rates)
                AppRichRow(
                  title: l10n.financeInterestPercent(rate.rate),
                  subtitle: rate.end == null
                      ? dates.formatMediumDate(rate.start)
                      : '${dates.formatMediumDate(rate.start)} – '
                            '${dates.formatMediumDate(rate.end!)}',
                ),
            ],
          ),
        ],
        if (_canWrite())
          AppGroupedCard(
            children: [
              AppRichRow(
                title: l10n.financeInterestSettings,
                onTap: canWrite ? () => _settings(config) : null,
              ),
              AppRichRow(
                title: l10n.financeInterestAddRate,
                onTap: canWrite ? _addRate : null,
              ),
              AppRichRow(
                title: config.enabled
                    ? l10n.financeInterestPause
                    : l10n.financeInterestResume,
                onTap: canWrite
                    ? () => _save(
                        () => widget.repository.updateWalletInterest(
                          _workspace,
                          widget.wallet,
                          {'enabled': !config.enabled},
                          active: _canWrite,
                        ),
                      )
                    : null,
              ),
              AppRichRow(
                title: l10n.financeInterestRemove,
                onTap: canWrite ? _delete : null,
              ),
            ],
          ),
      ],
    );
  }
}
