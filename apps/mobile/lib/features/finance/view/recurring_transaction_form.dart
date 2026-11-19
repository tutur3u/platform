import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/recurring_transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/utils/checkpoint_variance.dart';
import 'package:mobile/l10n/l10n.dart';

String recurringFrequencyLabel(
  AppLocalizations l10n,
  RecurringFrequency value,
) => switch (value) {
  RecurringFrequency.daily => l10n.financeRecurringDaily,
  RecurringFrequency.weekly => l10n.financeRecurringWeekly,
  RecurringFrequency.monthly => l10n.financeRecurringMonthly,
  RecurringFrequency.yearly => l10n.financeRecurringYearly,
};

class RecurringTransactionForm extends StatefulWidget {
  const RecurringTransactionForm({
    required this.wallets,
    required this.categories,
    required this.showAmounts,
    this.record,
    super.key,
  });

  final List<Wallet> wallets;
  final List<TransactionCategory> categories;
  final bool showAmounts;
  final RecurringTransaction? record;

  @override
  State<RecurringTransactionForm> createState() =>
      _RecurringTransactionFormState();
}

class _RecurringTransactionFormState extends State<RecurringTransactionForm> {
  RecurringTransactionDraft? get _initial => widget.record?.draft;
  late final TextEditingController _name = TextEditingController(
    text: _initial?.name,
  );
  late final TextEditingController _description = TextEditingController(
    text: _initial?.description,
  );
  late final TextEditingController _amount = TextEditingController(
    text: _initial?.amount.toString(),
  );
  late String? _walletId = _initial?.walletId ?? widget.wallets.firstOrNull?.id;
  late String? _categoryId = _initial?.categoryId;
  late RecurringFrequency _frequency =
      _initial?.frequency ?? RecurringFrequency.monthly;
  late DateTime _start =
      _initial?.startDate ?? DateUtils.dateOnly(DateTime.now());
  late DateTime? _end = _initial?.endDate;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool end}) async {
    final chosen = await showAppDatePicker(
      context: context,
      initialDate: end ? _end ?? _start : _start,
      firstDate: end ? _start : DateTime(1900),
      lastDate: DateTime(2100),
    );
    if (chosen == null || !mounted) return;
    setState(() {
      if (end) {
        _end = chosen;
      } else {
        _start = chosen;
        if (_end?.isBefore(chosen) ?? false) _end = null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final dates = MaterialLocalizations.of(context);
    final amount = parseCheckpointBalance(_amount.text);
    final wallet = widget.wallets
        .where((wallet) => wallet.id == _walletId)
        .firstOrNull;
    final name = _name.text.trim();
    return AppSheetScaffold(
      title: widget.record == null ? l10n.financeRecurringNew : l10n.commonEdit,
      actions: [
        AppButton.primary(
          onPressed:
              name.isEmpty || amount == null || amount == 0 || wallet == null
              ? null
              : () => Navigator.of(context).pop<RecurringTransactionDraft>((
                  name: name,
                  description: _description.text.trim().isEmpty
                      ? null
                      : _description.text.trim(),
                  amount: amount,
                  walletId: wallet.id,
                  categoryId: _categoryId,
                  frequency: _frequency,
                  startDate: _start,
                  endDate: _end,
                )),
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppLayout.itemGap,
        children: [
          AppTextField(
            controller: _name,
            label: l10n.financeRecurringName,
            placeholder: l10n.financeRecurringName,
            onChanged: (_) => setState(() {}),
          ),
          AppSelect<String>(
            title: l10n.financeWallet,
            placeholder: l10n.financeWallet,
            options: [
              for (final wallet in widget.wallets)
                AppSelectOption(
                  value: wallet.id,
                  label: wallet.name ?? l10n.financeWallet,
                  description: wallet.currency,
                ),
            ],
            value: _walletId,
            onChanged: (id) => setState(() => _walletId = id),
          ),
          AppTextField(
            controller: _amount,
            label: l10n.financeRecurringSignedAmount,
            placeholder: l10n.financeCheckpointsBalancePlaceholder,
            obscureText: !widget.showAmounts,
            keyboardType: const TextInputType.numberWithOptions(
              decimal: true,
              signed: true,
            ),
            onChanged: (_) => setState(() {}),
          ),
          AppSelect<String>(
            title: l10n.financeCategory,
            placeholder: l10n.financeCheckpointsNoCategory,
            options: [
              AppSelectOption(
                value: '',
                label: l10n.financeCheckpointsNoCategory,
              ),
              for (final category in widget.categories)
                AppSelectOption(
                  value: category.id,
                  label: category.name ?? category.id,
                ),
            ],
            value: _categoryId,
            onChanged: (id) =>
                setState(() => _categoryId = id.isEmpty ? null : id),
          ),
          AppSelect<RecurringFrequency>(
            title: l10n.financeRecurringFrequency,
            options: [
              for (final value in RecurringFrequency.values)
                AppSelectOption(
                  value: value,
                  label: recurringFrequencyLabel(l10n, value),
                ),
            ],
            value: _frequency,
            onChanged: (value) => setState(() => _frequency = value),
          ),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              AppButton.secondary(
                onPressed: () => _pickDate(end: false),
                child: Text(
                  l10n.financeRecurringStartDate(dates.formatShortDate(_start)),
                ),
              ),
              AppButton.secondary(
                onPressed: () => _pickDate(end: true),
                child: Text(
                  _end == null
                      ? l10n.financeRecurringAddEnd
                      : l10n.financeRecurringEndDate(
                          dates.formatShortDate(_end!),
                        ),
                ),
              ),
              if (_end != null)
                AppIconButton(
                  tooltip: l10n.financeRecurringClearEnd,
                  icon: const Icon(LucideIcons.x),
                  onPressed: () => setState(() => _end = null),
                ),
            ],
          ),
          AppTextField(
            controller: _description,
            label: l10n.financeCheckpointsDescriptionLabel,
            placeholder: l10n.financeCheckpointsDescriptionLabel,
            maxLines: 2,
          ),
        ],
      ),
    );
  }
}
