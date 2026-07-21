import 'package:flutter/material.dart' hide Card;
import 'package:intl/intl.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WalletCheckpointFormResult {
  const WalletCheckpointFormResult({
    required this.actualBalance,
    required this.checkedAt,
    this.note,
  });

  final double actualBalance;
  final DateTime checkedAt;
  final String? note;
}

class WalletCheckpointReconciliationFormResult {
  const WalletCheckpointReconciliationFormResult({
    this.categoryId,
    this.description,
  });

  final String? categoryId;
  final String? description;
}

class WalletCheckpointBatchFormResult {
  const WalletCheckpointBatchFormResult({
    required this.checkedAt,
    required this.entries,
  });

  final DateTime checkedAt;
  final List<WalletCheckpointBatchEntry> entries;
}

class WalletCheckpointFormSheet extends StatefulWidget {
  const WalletCheckpointFormSheet({
    required this.wallet,
    this.checkpoint,
    super.key,
  });

  final Wallet wallet;
  final WalletCheckpoint? checkpoint;

  @override
  State<WalletCheckpointFormSheet> createState() =>
      _WalletCheckpointFormSheetState();
}

class _WalletCheckpointFormSheetState extends State<WalletCheckpointFormSheet> {
  late final TextEditingController _amountController;
  late final TextEditingController _checkedAtController;
  late final TextEditingController _noteController;
  String? _amountError;
  String? _checkedAtError;

  @override
  void initState() {
    super.initState();
    final checkpoint = widget.checkpoint;
    _amountController = TextEditingController(
      text: checkpoint == null ? '' : _formatAmount(checkpoint.actualBalance),
    );
    _checkedAtController = TextEditingController(
      text: _formatDateTimeInput(checkpoint?.checkedAt ?? DateTime.now()),
    );
    _noteController = TextEditingController(text: checkpoint?.note ?? '');
  }

  @override
  void dispose() {
    _amountController.dispose();
    _checkedAtController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.checkpoint != null;
    final l10n = context.l10n;

    return FinanceModalScaffold(
      title: isEdit
          ? l10n.financeCheckpointsEdit
          : l10n.financeCheckpointsRecord,
      subtitle: l10n.financeCheckpointsRecordDescription(
        widget.wallet.name ?? l10n.financeWallets,
      ),
      actions: [
        shad.SecondaryButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(onPressed: _submit, child: Text(l10n.commonSave)),
      ],
      child: ListView(
        children: [
          _FieldLabel(
            label: l10n.financeCheckpointsActualBalanceWithCurrency(
              (widget.wallet.currency ?? 'USD').toUpperCase(),
            ),
          ),
          const shad.Gap(6),
          _SheetTextField(
            controller: _amountController,
            placeholder: '0',
            keyboardType: const TextInputType.numberWithOptions(
              decimal: true,
              signed: true,
            ),
            errorText: _amountError,
            onChanged: (_) => setState(() => _amountError = null),
          ),
          const shad.Gap(14),
          _FieldLabel(label: l10n.financeCheckpointsCheckedAt),
          const shad.Gap(6),
          _SheetTextField(
            controller: _checkedAtController,
            placeholder: '2026-06-16 23:09',
            errorText: _checkedAtError,
            onChanged: (_) => setState(() => _checkedAtError = null),
          ),
          const shad.Gap(14),
          _FieldLabel(label: l10n.financeCheckpointsNote),
          const shad.Gap(6),
          shad.TextArea(
            contextMenuBuilder: platformTextContextMenuBuilder(),
            controller: _noteController,
            placeholder: Text(l10n.financeCheckpointsNotePlaceholder),
            maxLength: 500,
          ),
        ],
      ),
    );
  }

  void _submit() {
    final amount = double.tryParse(_amountController.text.trim());
    final checkedAt = _parseDateTimeInput(_checkedAtController.text.trim());

    setState(() {
      _amountError = amount == null
          ? context.l10n.financeCheckpointsAmountRequired
          : null;
      _checkedAtError = checkedAt == null
          ? context.l10n.financeCheckpointsCheckedAtRequired
          : null;
    });

    if (amount == null || checkedAt == null) {
      return;
    }

    final note = _noteController.text.trim();
    Navigator.of(context).pop(
      WalletCheckpointFormResult(
        actualBalance: amount,
        checkedAt: checkedAt,
        note: note.isEmpty ? null : note,
      ),
    );
  }
}

class WalletCheckpointDeleteSheet extends StatelessWidget {
  const WalletCheckpointDeleteSheet({
    required this.checkpoint,
    required this.showAmounts,
    super.key,
  });

  final WalletCheckpoint checkpoint;
  final bool showAmounts;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return FinanceModalScaffold(
      title: l10n.financeCheckpointsDelete,
      subtitle: l10n.financeCheckpointsDeleteDescription,
      maxBodyHeightFactor: 0.44,
      actions: [
        shad.SecondaryButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(l10n.commonDelete),
        ),
      ],
      child: FinancePanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_formatDateTimeInput(checkpoint.checkedAt)),
            const shad.Gap(8),
            Text(
              maskFinanceValue(
                formatCurrency(checkpoint.actualBalance, checkpoint.currency),
                showAmounts: showAmounts,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class WalletCheckpointReconciliationSheet extends StatefulWidget {
  const WalletCheckpointReconciliationSheet({
    required this.interval,
    required this.wallet,
    required this.categories,
    required this.showAmounts,
    super.key,
  });

  final WalletCheckpointInterval interval;
  final Wallet wallet;
  final List<TransactionCategory> categories;
  final bool showAmounts;

  @override
  State<WalletCheckpointReconciliationSheet> createState() =>
      _WalletCheckpointReconciliationSheetState();
}

class _WalletCheckpointReconciliationSheetState
    extends State<WalletCheckpointReconciliationSheet> {
  final TextEditingController _descriptionController = TextEditingController();
  String? _categoryId;

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final currency = widget.wallet.currency ?? 'USD';
    final categories = widget.categories
        .where((category) => category.isExpense ?? true)
        .toList(growable: false);

    return FinanceModalScaffold(
      title: l10n.financeCheckpointsReconcile,
      subtitle: l10n.financeCheckpointsReconcileDescription,
      actions: [
        shad.SecondaryButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: () {
            final description = _descriptionController.text.trim();
            Navigator.of(context).pop(
              WalletCheckpointReconciliationFormResult(
                categoryId: _categoryId,
                description: description.isEmpty ? null : description,
              ),
            );
          },
          child: Text(l10n.financeCheckpointsCreateReconciliation),
        ),
      ],
      child: ListView(
        children: [
          FinancePanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _FieldLabel(label: l10n.financeCheckpointsVariance),
                const shad.Gap(6),
                Text(
                  maskFinanceValue(
                    formatCurrency(widget.interval.intervalVariance, currency),
                    showAmounts: widget.showAmounts,
                  ),
                  style: shad.Theme.of(
                    context,
                  ).typography.h4.copyWith(fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
          const shad.Gap(14),
          _FieldLabel(label: l10n.financeCheckpointsCategory),
          const shad.Gap(8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ChoiceChip(
                label: l10n.financeCheckpointsNoCategory,
                selected: _categoryId == null,
                onTap: () => setState(() => _categoryId = null),
              ),
              for (final category in categories)
                _ChoiceChip(
                  label: category.name ?? '-',
                  selected: _categoryId == category.id,
                  onTap: () => setState(() => _categoryId = category.id),
                ),
            ],
          ),
          const shad.Gap(14),
          _FieldLabel(label: l10n.financeCheckpointsDescriptionLabel),
          const shad.Gap(6),
          shad.TextArea(
            contextMenuBuilder: platformTextContextMenuBuilder(),
            controller: _descriptionController,
            placeholder: Text(
              l10n.financeCheckpointsReconcileDefaultDescription(
                widget.wallet.name ?? l10n.financeWallets,
              ),
            ),
            maxLength: 500,
          ),
        ],
      ),
    );
  }
}

class WalletCheckpointBatchSheet extends StatefulWidget {
  const WalletCheckpointBatchSheet({
    required this.wallets,
    required this.showAmounts,
    super.key,
  });

  final List<Wallet> wallets;
  final bool showAmounts;

  @override
  State<WalletCheckpointBatchSheet> createState() =>
      _WalletCheckpointBatchSheetState();
}

class _WalletCheckpointBatchSheetState
    extends State<WalletCheckpointBatchSheet> {
  late final TextEditingController _checkedAtController;
  late final TextEditingController _noteController;
  late final Map<String, TextEditingController> _amountControllers;
  String? _checkedAtError;
  String? _entriesError;

  @override
  void initState() {
    super.initState();
    _checkedAtController = TextEditingController(
      text: _formatDateTimeInput(DateTime.now()),
    );
    _noteController = TextEditingController();
    _amountControllers = {
      for (final wallet in widget.wallets) wallet.id: TextEditingController(),
    };
  }

  @override
  void dispose() {
    _checkedAtController.dispose();
    _noteController.dispose();
    for (final controller in _amountControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final totals = _enteredTotals();

    return FinanceModalScaffold(
      title: l10n.financeCheckpointsBatchRecord,
      subtitle: l10n.financeCheckpointsBatchDescription,
      actions: [
        shad.SecondaryButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(onPressed: _submit, child: Text(l10n.commonSave)),
      ],
      child: ListView(
        children: [
          _FieldLabel(label: l10n.financeCheckpointsCheckedAt),
          const shad.Gap(6),
          _SheetTextField(
            controller: _checkedAtController,
            placeholder: '2026-06-16 23:09',
            errorText: _checkedAtError,
            onChanged: (_) => setState(() => _checkedAtError = null),
          ),
          const shad.Gap(14),
          _FieldLabel(label: l10n.financeCheckpointsSharedNote),
          const shad.Gap(6),
          shad.TextArea(
            contextMenuBuilder: platformTextContextMenuBuilder(),
            controller: _noteController,
            placeholder: Text(l10n.financeCheckpointsNotePlaceholder),
            maxLength: 500,
          ),
          const shad.Gap(18),
          if (totals.isNotEmpty) ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in totals.entries)
                  FinanceStatChip(
                    label: entry.key,
                    value: maskFinanceValue(
                      formatCurrency(entry.value, entry.key),
                      showAmounts: widget.showAmounts,
                    ),
                    tint: FinancePalette.of(context).accent,
                  ),
              ],
            ),
            const shad.Gap(18),
          ],
          for (final wallet in widget.wallets) ...[
            _BatchWalletRow(
              wallet: wallet,
              controller: _amountControllers[wallet.id]!,
              showAmounts: widget.showAmounts,
              onChanged: (_) => setState(() => _entriesError = null),
            ),
            const shad.Gap(10),
          ],
          if (_entriesError != null) _FieldError(message: _entriesError!),
        ],
      ),
    );
  }

  Map<String, double> _enteredTotals() {
    final totals = <String, double>{};
    for (final wallet in widget.wallets) {
      final amount = double.tryParse(
        _amountControllers[wallet.id]?.text.trim() ?? '',
      );
      if (amount == null) continue;
      final currency = (wallet.currency ?? 'USD').toUpperCase();
      totals[currency] = (totals[currency] ?? 0) + amount;
    }
    return totals;
  }

  void _submit() {
    final checkedAt = _parseDateTimeInput(_checkedAtController.text.trim());
    final note = _noteController.text.trim();
    final entries = <WalletCheckpointBatchEntry>[];

    for (final wallet in widget.wallets) {
      final amount = double.tryParse(
        _amountControllers[wallet.id]?.text.trim() ?? '',
      );
      if (amount == null) continue;
      entries.add(
        WalletCheckpointBatchEntry(
          walletId: wallet.id,
          actualBalance: amount,
          note: note.isEmpty ? null : note,
        ),
      );
    }

    setState(() {
      _checkedAtError = checkedAt == null
          ? context.l10n.financeCheckpointsCheckedAtRequired
          : null;
      _entriesError = entries.isEmpty
          ? context.l10n.financeCheckpointsEntriesRequired
          : null;
    });

    if (checkedAt == null || entries.isEmpty) {
      return;
    }

    Navigator.of(context).pop(
      WalletCheckpointBatchFormResult(checkedAt: checkedAt, entries: entries),
    );
  }
}

class _BatchWalletRow extends StatelessWidget {
  const _BatchWalletRow({
    required this.wallet,
    required this.controller,
    required this.showAmounts,
    required this.onChanged,
  });

  final Wallet wallet;
  final TextEditingController controller;
  final bool showAmounts;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final currency = (wallet.currency ?? 'USD').toUpperCase();

    return FinancePanel(
      padding: const EdgeInsets.all(12),
      radius: 18,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  wallet.name ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(4),
                Text(
                  maskFinanceValue(
                    formatCurrency(wallet.balance ?? 0, currency),
                    showAmounts: showAmounts,
                  ),
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          SizedBox(
            width: 132,
            child: shad.TextField(
              contextMenuBuilder: platformTextContextMenuBuilder(),
              controller: controller,
              placeholder: Text(currency),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
                signed: true,
              ),
              onChanged: onChanged,
            ),
          ),
        ],
      ),
    );
  }
}

class _ChoiceChip extends StatelessWidget {
  const _ChoiceChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? palette.accent.withValues(alpha: 0.14)
                : palette.panel,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected ? palette.accent : palette.subtleBorder,
            ),
          ),
          child: Text(
            label,
            style: theme.typography.small.copyWith(
              color: selected ? palette.accent : theme.colorScheme.foreground,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: shad.Theme.of(context).typography.xSmall.copyWith(
        color: shad.Theme.of(context).colorScheme.mutedForeground,
        fontWeight: FontWeight.w800,
      ),
    );
  }
}

class _SheetTextField extends StatelessWidget {
  const _SheetTextField({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.keyboardType,
    this.errorText,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final TextInputType? keyboardType;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        shad.TextField(
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: controller,
          placeholder: Text(placeholder),
          keyboardType: keyboardType,
          onChanged: onChanged,
        ),
        if (errorText != null) ...[
          const shad.Gap(4),
          _FieldError(message: errorText!),
        ],
      ],
    );
  }
}

class _FieldError extends StatelessWidget {
  const _FieldError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(
      message,
      style: shad.Theme.of(context).typography.xSmall.copyWith(
        color: shad.Theme.of(context).colorScheme.destructive,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

String _formatDateTimeInput(DateTime value) {
  return DateFormat('yyyy-MM-dd HH:mm').format(value.toLocal());
}

DateTime? _parseDateTimeInput(String value) {
  final normalized = value.trim().replaceFirst(' ', 'T');
  return DateTime.tryParse(normalized);
}

String _formatAmount(double amount) {
  if (amount == amount.roundToDouble()) {
    return amount.toStringAsFixed(0);
  }
  return amount.toString();
}
