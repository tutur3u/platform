import 'dart:async';

import 'package:flutter/material.dart' hide AlertDialog, TextField;
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'transaction_detail_sheet_edit_dialog.dart';

Future<bool> showTransactionDetailSheet(
  BuildContext context, {
  required String wsId,
  required Transaction transaction,
  required FinanceRepository repository,
  required Future<Transaction> Function({
    required String transactionId,
    required double amount,
    String? description,
    DateTime? takenAt,
    String? walletId,
    String? categoryId,
    bool? reportOptIn,
    bool? isAmountConfidential,
    bool? isDescriptionConfidential,
    bool? isCategoryConfidential,
  })
  onSave,
  required Future<void> Function(String transactionId) onDelete,
}) async {
  final result = await showAdaptiveSheet<bool>(
    context: context,
    builder: (_) => _TransactionDetailSheet(
      wsId: wsId,
      transaction: transaction,
      repository: repository,
      onSave: onSave,
      onDelete: onDelete,
    ),
  );

  return result == true;
}

class _TransactionDetailSheet extends StatefulWidget {
  const _TransactionDetailSheet({
    required this.wsId,
    required this.transaction,
    required this.repository,
    required this.onSave,
    required this.onDelete,
  });

  final String wsId;
  final Transaction transaction;
  final FinanceRepository repository;
  final Future<Transaction> Function({
    required String transactionId,
    required double amount,
    String? description,
    DateTime? takenAt,
    String? walletId,
    String? categoryId,
    bool? reportOptIn,
    bool? isAmountConfidential,
    bool? isDescriptionConfidential,
    bool? isCategoryConfidential,
  })
  onSave;
  final Future<void> Function(String transactionId) onDelete;

  @override
  State<_TransactionDetailSheet> createState() =>
      _TransactionDetailSheetState();
}

class _TransactionDetailSheetState extends State<_TransactionDetailSheet> {
  late Transaction _transaction;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final amount = _transaction.amount ?? 0;
    final isExpense = amount < 0;
    final currency = _transaction.walletCurrency ?? 'USD';
    final date = _transaction.takenAt ?? _transaction.createdAt;
    final dateText = date != null
        ? DateFormat.yMMMd().add_jm().format(date.toLocal())
        : '-';

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.mutedForeground.withValues(
                    alpha: 0.4,
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const shad.Gap(16),
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.financeTransactionDetails,
                    style: theme.typography.h3,
                  ),
                ),
                shad.GhostButton(
                  onPressed: _showEditDialog,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.edit, size: 14),
                      const shad.Gap(4),
                      Text(l10n.financeEditTransaction),
                    ],
                  ),
                ),
              ],
            ),
            const shad.Gap(20),
            _DetailRow(
              label: l10n.financeAmount,
              value:
                  '${isExpense ? '' : '+'}${formatCurrency(amount, currency)}',
              valueColor: isExpense
                  ? theme.colorScheme.destructive
                  : theme.colorScheme.primary,
              valueBold: true,
            ),
            const shad.Gap(12),
            _DetailRow(
              label: l10n.financeDescription,
              value: (_transaction.description?.trim().isNotEmpty ?? false)
                  ? _transaction.description!.trim()
                  : '-',
            ),
            const shad.Gap(12),
            _DetailRow(
              label: l10n.financeTakenAt,
              value: dateText,
            ),
            const shad.Gap(12),
            _DetailRow(
              label: l10n.financeCategory,
              value: _transaction.categoryName ?? '-',
            ),
            const shad.Gap(12),
            _DetailRow(
              label: l10n.financeWallet,
              value: _transaction.walletName ?? '-',
            ),
            const shad.Gap(24),
            const Divider(),
            const shad.Gap(12),
            shad.DestructiveButton(
              onPressed: _showDeleteConfirmation,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.delete_outline, size: 16),
                  const shad.Gap(8),
                  Text(l10n.financeDeleteTransaction),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    _transaction = widget.transaction;
  }

  Future<void> _showDeleteConfirmation() async {
    final l10n = context.l10n;
    final sheetNavigator = Navigator.of(context);

    await shad.showDialog<bool>(
      context: context,
      builder: (_) => AsyncDeleteConfirmationDialog(
        toastContext: context,
        maxWidth: MediaQuery.of(context).size.width * 0.85,
        title: l10n.financeDeleteTransaction,
        message: l10n.financeDeleteTransactionConfirm,
        cancelLabel: l10n.commonCancel,
        confirmLabel: l10n.financeDeleteTransaction,
        onConfirm: () async {
          await widget.onDelete(_transaction.id);

          if (!mounted) return;
          shad.showToast(
            context: context,
            builder: (ctx, overlay) => shad.Alert(
              content: Text(ctx.l10n.financeTransactionDeleted),
            ),
          );
          sheetNavigator.pop(true);
        },
      ),
    );
  }

  Future<void> _showEditDialog() async {
    final updated = await showAdaptiveSheet<Transaction>(
      context: context,
      builder: (_) => _EditTransactionDialog(
        wsId: widget.wsId,
        transaction: _transaction,
        repository: widget.repository,
        onSave: widget.onSave,
      ),
    );

    if (updated == null || !mounted) return;

    setState(() => _transaction = updated);
    shad.showToast(
      context: context,
      builder: (ctx, overlay) => shad.Alert(
        content: Text(ctx.l10n.financeTransactionUpdated),
      ),
    );
    Navigator.of(context).pop(true);
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(label)),
        shad.Switch(
          value: value,
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.valueBold = false,
    this.valueColor,
  });

  final String label;
  final String value;
  final bool valueBold;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 110,
          child: Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const shad.Gap(12),
        Expanded(
          child: Text(
            value,
            style: theme.typography.base.copyWith(
              fontWeight: valueBold ? FontWeight.w600 : FontWeight.w400,
              color: valueColor,
            ),
          ),
        ),
      ],
    );
  }
}
