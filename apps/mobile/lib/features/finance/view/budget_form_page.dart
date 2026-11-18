import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_date_picker.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/components/app_slider.dart';
import 'package:mobile/core/ui/components/app_text_field.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/repositories/finance_repository.dart';

import 'package:mobile/features/finance/cubit/budgets_cubit.dart';
import 'package:mobile/features/finance/widgets/finance_form_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

enum BudgetFormResult { saved, deleted, pending }

/// Opens the budget form above the shell; resolves with what happened, or
/// null when it was closed without changes.
Future<BudgetFormResult?> showBudgetForm(
  BuildContext context, {
  required BudgetsCubit cubit,
  required String wsId,
  FinanceBudget? budget,
  DateTime? now,
}) => showFinanceFormRoute<BudgetFormResult>(
  context,
  builder: (_) =>
      BudgetFormPage(cubit: cubit, wsId: wsId, budget: budget, now: now),
);

/// Parses a typed amount, ignoring grouping separators and spaces.
double? parseBudgetAmount(String raw, {String decimalSeparator = '.'}) {
  final cleaned = raw.replaceAll(RegExp(r'\s'), '');
  if (cleaned.isEmpty) return null;
  final grouping = decimalSeparator == ',' ? '.' : ',';
  final normalized = cleaned
      .replaceAll(grouping, '')
      .replaceAll(decimalSeparator, '.');
  return double.tryParse(normalized);
}

class BudgetFormPage extends StatefulWidget {
  const BudgetFormPage({
    required this.cubit,
    required this.wsId,
    this.budget,
    this.now,
    super.key,
  });

  final BudgetsCubit cubit;
  final String wsId;
  final FinanceBudget? budget;
  final DateTime? now;

  @override
  State<BudgetFormPage> createState() => _BudgetFormPageState();
}

class _BudgetFormPageState extends State<BudgetFormPage> {
  late final _name = TextEditingController(text: widget.budget?.name);
  late final _description = TextEditingController(
    text: widget.budget?.description,
  );
  late final _amount = TextEditingController(
    text: widget.budget == null
        ? ''
        : _plain(widget.budget!.amount).replaceAll('.', _decimalSeparator),
  );
  late FinanceBudgetPeriod _period =
      widget.budget?.period ?? FinanceBudgetPeriod.monthly;
  late DateTime _start = widget.budget?.startDate ?? _monthStart();
  late DateTime? _end = widget.budget?.endDate;
  late double _threshold = widget.budget?.effectiveThreshold ?? 80;
  late String? _categoryId = widget.budget?.categoryId;
  late String? _walletId = widget.budget?.walletId;
  bool _saving = false;
  bool _editingAmount = false;
  bool _submitted = false;

  bool get _isNew => widget.budget == null;

  DateTime _monthStart() {
    final now = widget.now ?? DateTime.now();
    return DateTime(now.year, now.month);
  }

  static String _plain(double value) => value == value.roundToDouble()
      ? value.toStringAsFixed(0)
      : value.toString();

  String get _decimalSeparator => NumberFormat.decimalPattern(
    Localizations.localeOf(context).toString(),
  ).symbols.DECIMAL_SEP;

  String? _nameError(BuildContext context) =>
      _submitted && _name.text.trim().isEmpty
      ? context.l10n.financeBudgetNameRequired
      : null;

  String? _amountError(BuildContext context) {
    if (!_submitted) return null;
    final value = parseBudgetAmount(
      _amount.text,
      decimalSeparator: _decimalSeparator,
    );
    return value == null || !value.isFinite || value <= 0
        ? context.l10n.financeBudgetAmountRequired
        : null;
  }

  String? _endError(BuildContext context) =>
      _submitted &&
          _period == FinanceBudgetPeriod.custom &&
          (_end == null || _end!.isBefore(_start))
      ? context.l10n.financeBudgetEndAfterStart
      : null;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _submitted = true);
    if (_nameError(context) != null ||
        _amountError(context) != null ||
        _endError(context) != null) {
      return;
    }
    final description = _description.text.trim();
    final budget = FinanceBudget(
      id: widget.budget?.id ?? '',
      name: _name.text.trim(),
      description: description.isEmpty ? null : description,
      amount: parseBudgetAmount(
        _amount.text,
        decimalSeparator: _decimalSeparator,
      )!,
      period: _period,
      startDate: _start,
      endDate: _period == FinanceBudgetPeriod.custom ? _end : null,
      alertThreshold: _threshold.roundToDouble(),
      categoryId: _categoryId,
      walletId: _walletId,
    );
    setState(() => _saving = true);
    try {
      final result = await widget.cubit.save(
        budget,
        isNew: _isNew,
        wsId: widget.wsId,
      );
      if (mounted) {
        Navigator.of(context).pop(
          result == FinanceBudgetWrite.pending
              ? BudgetFormResult.pending
              : BudgetFormResult.saved,
        );
      }
    } on Object {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppToast(context, message: context.l10n.financeBudgetSaveFailed);
    }
  }

  Future<void> _delete() async {
    final l10n = context.l10n;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.financeDeleteBudget,
      message: l10n.financeDeleteBudgetBody,
      confirmLabel: l10n.commonDelete,
      cancelLabel: l10n.commonCancel,
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    setState(() => _saving = true);
    try {
      final result = await widget.cubit.delete(
        widget.budget!.id,
        wsId: widget.wsId,
      );
      if (mounted) {
        Navigator.of(context).pop(
          result == FinanceBudgetWrite.pending
              ? BudgetFormResult.pending
              : BudgetFormResult.deleted,
        );
      }
    } on Object {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppToast(context, message: context.l10n.financeBudgetDeleteFailed);
    }
  }

  Future<void> _pickDate({required bool end}) async {
    final initial = end ? (_end ?? _start) : _start;
    final picked = await showAppDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null || !mounted) return;
    setState(() {
      final day = DateTime(picked.year, picked.month, picked.day);
      if (end) {
        _end = day;
      } else {
        _start = day;
      }
    });
  }

  Future<void> _pickCategory() async {
    final l10n = context.l10n;
    final state = widget.cubit.state;
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.financeCategory,
      selected: _categoryId ?? '',
      choices: [
        AppSheetChoice(value: '', label: l10n.financeAllCategories),
        for (final category in state.categories)
          if (category.isExpense != false)
            AppSheetChoice(
              value: category.id,
              label: category.name ?? category.id,
            ),
      ],
    );
    if (picked == null || !mounted) return;
    setState(() => _categoryId = picked.isEmpty ? null : picked);
  }

  Future<void> _pickWallet() async {
    final l10n = context.l10n;
    final state = widget.cubit.state;
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.financeWallet,
      selected: _walletId ?? '',
      choices: [
        AppSheetChoice(value: '', label: l10n.financeAllWallets),
        for (final wallet in state.wallets)
          AppSheetChoice(value: wallet.id, label: wallet.name ?? wallet.id),
      ],
    );
    if (picked == null || !mounted) return;
    setState(() => _walletId = picked.isEmpty ? null : picked);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = widget.cubit.state;
    final locale = Localizations.localeOf(context).toString();
    final date = DateFormat.yMMMd(locale);
    return FinanceFormScaffold(
      title: _isNew ? l10n.financeNewBudget : l10n.financeEditBudget,
      saving: _saving,
      onSave: () => unawaited(_save()),
      secondaryAction: _isNew
          ? null
          : AppIconButton(
              key: const ValueKey('finance-budget-delete'),
              icon: const Icon(LucideIcons.trash2),
              tooltip: l10n.financeDeleteBudget,
              variant: AppButtonVariant.outline,
              shape: AppButtonShape.circle,
              onPressed: _saving ? null : () => unawaited(_delete()),
            ),
      children: [
        AppTextField(
          key: const ValueKey('finance-budget-name'),
          controller: _name,
          label: l10n.financeBudgetName,
          placeholder: l10n.financeBudgetNamePlaceholder,
          errorText: _nameError(context),
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpacing.lg),
        Focus(
          onFocusChange: (value) => setState(() => _editingAmount = value),
          child: AppTextField(
            key: const ValueKey('finance-budget-amount'),
            controller: _amount,
            obscureText: !_editingAmount && !financeAmountsVisible(context),
            label: l10n.financeBudgetLimit(state.workspaceCurrency),
            placeholder: '0',
            errorText: _amountError(context),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9.,\s]')),
            ],
            onChanged: (_) => setState(() {}),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppSegmentedControl<FinanceBudgetPeriod>(
          segments: [
            AppSegment(
              value: FinanceBudgetPeriod.monthly,
              label: l10n.financeBudgetMonthly,
            ),
            AppSegment(
              value: FinanceBudgetPeriod.yearly,
              label: l10n.financeBudgetYearly,
            ),
            AppSegment(
              value: FinanceBudgetPeriod.custom,
              label: l10n.financeBudgetCustom,
            ),
          ],
          selected: _period,
          onChanged: (value) => setState(() => _period = value),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppGroupedCard(
          children: [
            AppGroupedRow(
              key: const ValueKey('finance-budget-start'),
              leading: const AppIconTile(icon: LucideIcons.calendar),
              title: Text(l10n.financeBudgetStart),
              trailing: Text(date.format(_start)),
              onTap: () => unawaited(_pickDate(end: false)),
            ),
            if (_period == FinanceBudgetPeriod.custom)
              AppGroupedRow(
                key: const ValueKey('finance-budget-end'),
                leading: const AppIconTile(icon: LucideIcons.calendarCheck),
                title: Text(l10n.financeBudgetEnd),
                subtitle: _endError(context) == null
                    ? null
                    : Text(
                        _endError(context)!,
                        style: TextStyle(
                          color: context.tokens.colorScheme.destructive,
                        ),
                      ),
                trailing: Text(_end == null ? '—' : date.format(_end!)),
                onTap: () => unawaited(_pickDate(end: true)),
              ),
            AppGroupedRow(
              key: const ValueKey('finance-budget-category'),
              leading: const AppIconTile(icon: LucideIcons.tags),
              title: Text(l10n.financeCategory),
              trailing: Text(
                state.categoryFor(_categoryId)?.name ??
                    l10n.financeAllCategories,
              ),
              showChevron: true,
              onTap: () => unawaited(_pickCategory()),
            ),
            AppGroupedRow(
              key: const ValueKey('finance-budget-wallet'),
              leading: const AppIconTile(icon: LucideIcons.wallet),
              title: Text(l10n.financeWallet),
              trailing: Text(
                state.walletFor(_walletId)?.name ?? l10n.financeAllWallets,
              ),
              showChevron: true,
              onTap: () => unawaited(_pickWallet()),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          l10n.financeBudgetAlertAt(_threshold.round()),
          style: context.tokens.typography.uiSm,
        ),
        AppSlider(
          value: _threshold,
          max: 100,
          divisions: 20,
          onChanged: (value) => setState(() => _threshold = value),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          controller: _description,
          label: l10n.financeDescription,
          placeholder: l10n.financeBudgetDescriptionPlaceholder,
          minLines: 2,
          maxLines: 4,
        ),
      ],
    );
  }
}
