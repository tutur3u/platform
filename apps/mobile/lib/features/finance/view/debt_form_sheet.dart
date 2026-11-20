import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/debt_loan.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/utils/checkpoint_variance.dart';
import 'package:mobile/features/finance/widgets/currency_picker_dialog.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens the debt or loan form; resolves with the entry to save, or null
/// when dismissed. [debt] is edited when given; a new entry uses [currency].
Future<DebtLoan?> showDebtFormSheet(
  BuildContext context, {
  required List<Wallet> wallets,
  required String currency,
  required DateTime now,
  DebtLoan? debt,
}) => showAppSheet<DebtLoan>(
  context: context,
  size: AppSheetSize.large,
  builder: (_) =>
      DebtFormSheet(wallets: wallets, currency: currency, now: now, debt: debt),
);

class DebtFormSheet extends StatefulWidget {
  const DebtFormSheet({
    required this.wallets,
    required this.currency,
    required this.now,
    this.debt,
    super.key,
  });

  final List<Wallet> wallets;
  final String currency;
  final DateTime now;
  final DebtLoan? debt;

  @override
  State<DebtFormSheet> createState() => _DebtFormSheetState();
}

class _DebtFormSheetState extends State<DebtFormSheet> {
  late final DebtLoan? _initial = widget.debt;
  late DebtLoanType _type = _initial?.type ?? DebtLoanType.debt;
  late final _name = TextEditingController(text: _initial?.name);
  late final _counterparty = TextEditingController(
    text: _initial?.counterparty,
  );
  late final _amount = TextEditingController(
    text: _initial == null ? '' : _plain(_initial.principalAmount),
  );
  late final _rate = TextEditingController(
    text: switch (_initial?.interestRate) {
      final rate? when rate > 0 => _plain(rate),
      _ => '',
    },
  );
  late final _description = TextEditingController(text: _initial?.description);
  late String _currency = _initial?.currency ?? widget.currency;
  late DebtInterestType _interestType =
      _initial?.interestType ?? DebtInterestType.simple;
  late DateTime _start = _initial?.startDate ?? DateUtils.dateOnly(widget.now);
  late DateTime? _due = _initial?.dueDate;
  late String? _walletId = _initial?.walletId;
  bool _submitted = false;

  static String _plain(double value) =>
      value == value.roundToDouble() ? value.toStringAsFixed(0) : '$value';

  @override
  void dispose() {
    for (final controller in [
      _name,
      _counterparty,
      _amount,
      _rate,
      _description,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  double? get _principal {
    final value = parseCheckpointBalance(_amount.text);
    return value != null && value > 0 ? value : null;
  }

  double? get _interestRate {
    if (_rate.text.trim().isEmpty) return null;
    final value = parseCheckpointBalance(_rate.text);
    return value != null && value >= 0 ? value : null;
  }

  bool get _rateInvalid =>
      _rate.text.trim().isNotEmpty && _interestRate == null;

  Future<void> _pickDate({required bool due}) async {
    final date = await showAppDatePicker(
      context: context,
      initialDate: due ? (_due ?? _start) : _start,
      firstDate: due ? _start : DateTime(1900),
      lastDate: DateTime(2100, 12, 31),
    );
    if (date == null || !mounted) return;
    setState(() {
      if (due) {
        _due = date;
      } else {
        _start = date;
        if (_due case final current? when current.isBefore(date)) _due = date;
      }
    });
  }

  Future<void> _pickWallet() async {
    final l10n = context.l10n;
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.financeWallet,
      selected: _walletId ?? '',
      choices: [
        AppSheetChoice(value: '', label: l10n.financeDebtNoWallet),
        for (final wallet in widget.wallets)
          AppSheetChoice(
            value: wallet.id,
            label: wallet.name ?? l10n.financeWallet,
            icon: LucideIcons.wallet,
          ),
      ],
    );
    if (picked != null && mounted) {
      setState(() => _walletId = picked.isEmpty ? null : picked);
    }
  }

  Future<void> _pickCurrency() async {
    final picked = await showFinanceModal<String>(
      context: context,
      builder: (_) => CurrencyPickerDialog(initialCurrencyCode: _currency),
    );
    if (picked != null && mounted) setState(() => _currency = picked);
  }

  void _save() {
    setState(() => _submitted = true);
    final name = _name.text.trim();
    final principal = _principal;
    if (name.isEmpty || principal == null || _rateInvalid) return;
    String? text(TextEditingController controller) {
      final value = controller.text.trim();
      return value.isEmpty ? null : value;
    }

    final rate = _interestRate;
    Navigator.of(context).pop(
      DebtLoan(
        id: _initial?.id ?? '',
        name: name,
        type: _type,
        principalAmount: principal,
        currency: _currency,
        startDate: _start,
        status: _initial?.status ?? DebtLoanStatus.active,
        counterparty: text(_counterparty),
        description: text(_description),
        interestRate: rate,
        interestType: rate == null || rate == 0 ? null : _interestType,
        dueDate: _due,
        walletId: _walletId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final dates = MaterialLocalizations.of(context);
    final rate = _interestRate;
    return AppSheetScaffold(
      title: _initial == null ? l10n.financeDebtNew : l10n.financeDebtEditTitle,
      actions: [
        AppButton.primary(
          key: const ValueKey('debt-save'),
          onPressed: _save,
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppLayout.itemGap,
        children: [
          AppSegmentedControl<DebtLoanType>(
            key: const ValueKey('debt-type'),
            segments: [
              AppSegment(
                value: DebtLoanType.debt,
                label: l10n.financeDebtTypeDebt,
                icon: LucideIcons.arrowUpRight,
              ),
              AppSegment(
                value: DebtLoanType.loan,
                label: l10n.financeDebtTypeLoan,
                icon: LucideIcons.arrowDownLeft,
              ),
            ],
            selected: _type,
            onChanged: (type) => setState(() => _type = type),
          ),
          AppTextField(
            key: const ValueKey('debt-name'),
            controller: _name,
            label: l10n.financeDebtName,
            placeholder: l10n.financeDebtNamePlaceholder,
            maxLength: 255,
            errorText: _submitted && _name.text.trim().isEmpty
                ? l10n.financeDebtNameRequired
                : null,
            onChanged: (_) => setState(() {}),
          ),
          AppTextField(
            key: const ValueKey('debt-counterparty'),
            controller: _counterparty,
            label: l10n.financeDebtCounterparty,
            placeholder: l10n.financeDebtCounterpartyPlaceholder,
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            spacing: AppSpacing.sm,
            children: [
              Expanded(
                child: AppTextField(
                  key: const ValueKey('debt-amount'),
                  controller: _amount,
                  label: l10n.financeDebtPrincipal,
                  placeholder: l10n.financeDebtAmountPlaceholder,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  errorText: _submitted && _principal == null
                      ? l10n.financeDebtAmountRequired
                      : null,
                  onChanged: (_) => setState(() {}),
                ),
              ),
              AppButton.outline(
                key: const ValueKey('debt-currency'),
                onPressed: _pickCurrency,
                child: Text(_currency.toUpperCase()),
              ),
            ],
          ),
          AppTextField(
            key: const ValueKey('debt-rate'),
            controller: _rate,
            label: l10n.financeDebtInterestRate,
            placeholder: l10n.financeDebtAmountPlaceholder,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            errorText: _rateInvalid ? l10n.financeDebtAmountRequired : null,
            onChanged: (_) => setState(() {}),
          ),
          if (rate != null && rate > 0)
            AppSegmentedControl<DebtInterestType>(
              key: const ValueKey('debt-interest-type'),
              segments: [
                AppSegment(
                  value: DebtInterestType.simple,
                  label: l10n.financeDebtInterestSimple,
                ),
                AppSegment(
                  value: DebtInterestType.compound,
                  label: l10n.financeDebtInterestCompound,
                ),
              ],
              selected: _interestType,
              onChanged: (type) => setState(() => _interestType = type),
            ),
          AppGroupedCard(
            children: [
              AppRichRow(
                key: const ValueKey('debt-start'),
                title: l10n.financeStartDate,
                subtitle: dates.formatMediumDate(_start),
                leading: const AppIconTile(icon: LucideIcons.calendar),
                onTap: () => _pickDate(due: false),
              ),
              AppRichRow(
                key: const ValueKey('debt-due'),
                title: l10n.financeDebtDueDate,
                subtitle: _due == null
                    ? l10n.financeDebtNoDueDate
                    : dates.formatMediumDate(_due!),
                leading: const AppIconTile(icon: LucideIcons.calendarClock),
                trailing: _due == null
                    ? null
                    : AppIconButton(
                        icon: const Icon(LucideIcons.x),
                        tooltip: l10n.commonClear,
                        onPressed: () => setState(() => _due = null),
                      ),
                onTap: () => _pickDate(due: true),
              ),
              AppRichRow(
                key: const ValueKey('debt-wallet'),
                title: l10n.financeWallet,
                subtitle:
                    widget.wallets
                        .where((wallet) => wallet.id == _walletId)
                        .firstOrNull
                        ?.name ??
                    l10n.financeDebtNoWallet,
                leading: const AppIconTile(icon: LucideIcons.wallet),
                onTap: _pickWallet,
              ),
            ],
          ),
          AppTextField(
            key: const ValueKey('debt-description'),
            controller: _description,
            label: l10n.financeDescription,
            placeholder: l10n.financeDebtDescriptionPlaceholder,
            maxLines: 3,
            maxLength: 500,
          ),
        ],
      ),
    );
  }
}
