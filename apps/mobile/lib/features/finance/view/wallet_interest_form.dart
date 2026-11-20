import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/wallet_interest.dart';
import 'package:mobile/l10n/l10n.dart';

typedef InterestSettings = ({
  WalletInterestProvider provider,
  WalletInterestTier? tier,
  DateTime? start,
  DateTime? end,
});

String interestDate(DateTime date) =>
    DateFormat('yyyy-MM-dd', 'en').format(date);

String interestProviderLabel(WalletInterestProvider provider) =>
    switch (provider) {
      WalletInterestProvider.momo => 'MoMo',
      WalletInterestProvider.zalopay => 'ZaloPay',
    };

String interestTierLabel(AppLocalizations l10n, WalletInterestTier tier) =>
    switch (tier) {
      WalletInterestTier.standard => l10n.financeInterestStandard,
      WalletInterestTier.gold => l10n.financeInterestGold,
      WalletInterestTier.diamond => l10n.financeInterestDiamond,
    };

class WalletInterestForm extends StatefulWidget {
  const WalletInterestForm({required this.config, super.key});

  final WalletInterestConfig? config;

  @override
  State<WalletInterestForm> createState() => _WalletInterestFormState();
}

class _WalletInterestFormState extends State<WalletInterestForm> {
  late WalletInterestProvider _provider =
      widget.config?.provider ?? WalletInterestProvider.momo;
  late WalletInterestTier _tier =
      widget.config?.tier ?? WalletInterestTier.standard;
  late DateTime? _start = widget.config?.start;
  late DateTime? _end = widget.config?.end;

  Future<void> _selectDate({required bool start}) async {
    final current = start ? _start : _end;
    final date = await showAppDatePicker(
      context: context,
      initialDate: current ?? (start ? null : _start) ?? DateTime.now(),
      firstDate: start ? DateTime(1900) : _start ?? DateTime(1900),
      lastDate: DateTime(2100, 12, 31),
    );
    if (!mounted || date == null) return;
    setState(() {
      if (start) {
        _start = date;
        if (_end?.isBefore(date) ?? false) _end = null;
      } else {
        _end = date;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final dates = MaterialLocalizations.of(context);
    return AppSheetScaffold(
      title: widget.config == null
          ? l10n.financeInterestEnable
          : l10n.financeInterestSettings,
      actions: [
        AppButton.primary(
          onPressed: () => Navigator.of(context).pop<InterestSettings>((
            provider: _provider,
            tier: _provider == WalletInterestProvider.zalopay ? _tier : null,
            start: _start,
            end: _end,
          )),
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          if (widget.config == null)
            AppSelect<WalletInterestProvider>(
              title: l10n.financeInterestProvider,
              options: [
                for (final provider in WalletInterestProvider.values)
                  AppSelectOption(
                    value: provider,
                    label: interestProviderLabel(provider),
                  ),
              ],
              value: _provider,
              onChanged: (value) {
                if (mounted) setState(() => _provider = value);
              },
            ),
          if (_provider == WalletInterestProvider.zalopay)
            AppSelect<WalletInterestTier>(
              title: l10n.financeInterestTier,
              options: [
                for (final tier in WalletInterestTier.values)
                  AppSelectOption(
                    value: tier,
                    label: interestTierLabel(l10n, tier),
                  ),
              ],
              value: _tier,
              onChanged: (value) {
                if (mounted) setState(() => _tier = value);
              },
            ),
          AppGroupedCard(
            children: [
              AppRichRow(
                title: l10n.financeStartDate,
                subtitle: _start == null
                    ? l10n.financeInterestWalletCreation
                    : dates.formatFullDate(_start!),
                onTap: () => _selectDate(start: true),
                trailing: _start == null
                    ? null
                    : AppIconButton(
                        icon: const Icon(LucideIcons.x),
                        tooltip: l10n.financeInterestClearStart,
                        onPressed: () => setState(() => _start = null),
                      ),
              ),
              if (widget.config != null)
                AppRichRow(
                  title: l10n.financeEndDate,
                  subtitle: _end == null
                      ? l10n.financeInterestOngoing
                      : dates.formatFullDate(_end!),
                  onTap: () => _selectDate(start: false),
                  trailing: _end == null
                      ? null
                      : AppIconButton(
                          icon: const Icon(LucideIcons.x),
                          tooltip: l10n.financeInterestClearEnd,
                          onPressed: () => setState(() => _end = null),
                        ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class WalletInterestRateForm extends StatefulWidget {
  const WalletInterestRateForm({super.key});

  @override
  State<WalletInterestRateForm> createState() => _WalletInterestRateFormState();
}

class _WalletInterestRateFormState extends State<WalletInterestRateForm> {
  double? _rate;
  DateTime? _date;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final date = _date;
    final rate = _rate;
    return AppSheetScaffold(
      title: l10n.financeInterestAddRate,
      actions: [
        AppButton.primary(
          onPressed: rate == null || !rate.isFinite || rate < 0.01 || rate > 100
              ? null
              : () => Navigator.of(context).pop((rate: rate, date: date)),
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          AppTextField(
            label: l10n.financeInterestAnnualRate,
            placeholder: '5',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (value) => setState(
              () => _rate = double.tryParse(value.trim().replaceAll(',', '.')),
            ),
          ),
          AppRichRow(
            title: l10n.financeInterestEffectiveDate,
            subtitle: date == null
                ? l10n.financeToday
                : MaterialLocalizations.of(context).formatFullDate(date),
            onTap: () async {
              final selected = await showAppDatePicker(
                context: context,
                initialDate: date ?? DateTime.now(),
                firstDate: DateTime(1900),
                lastDate: DateTime(2100, 12, 31),
              );
              if (mounted && selected != null) setState(() => _date = selected);
            },
          ),
        ],
      ),
    );
  }
}
