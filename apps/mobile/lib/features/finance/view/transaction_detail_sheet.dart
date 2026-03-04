import 'dart:async';

import 'package:flutter/material.dart' hide AlertDialog, TextField;
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:intl/number_symbols.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'transaction_detail_sheet_edit_dialog.dart';

typedef TransactionSaveHandler =
    Future<Transaction> Function({
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
    });

typedef TransactionCreateHandler =
    Future<void> Function({
      required double amount,
      String? description,
      DateTime? takenAt,
      String? walletId,
      String? categoryId,
      bool? reportOptIn,
      bool? isAmountConfidential,
      bool? isDescriptionConfidential,
      bool? isCategoryConfidential,
    });

Color? _parseHexColor(String? hex) {
  if (hex == null) return null;
  final cleaned = hex.replaceFirst('#', '');
  if (cleaned.length != 6 && cleaned.length != 8) return null;
  final value = int.tryParse(
    cleaned.length == 6 ? 'FF$cleaned' : cleaned,
    radix: 16,
  );
  return value != null ? Color(value) : null;
}

Future<bool> showTransactionDetailSheet(
  BuildContext context, {
  required String wsId,
  required Transaction transaction,
  required FinanceRepository repository,
  required TransactionSaveHandler onSave,
  required Future<void> Function(String transactionId) onDelete,
  String? workspaceCurrency,
  List<ExchangeRate>? exchangeRates,
}) async {
  final result = await showAdaptiveSheet<bool>(
    context: context,
    builder: (_) => _TransactionDetailSheet(
      wsId: wsId,
      transaction: transaction,
      repository: repository,
      onSave: onSave,
      onDelete: onDelete,
      workspaceCurrency: workspaceCurrency,
      exchangeRates: exchangeRates,
    ),
  );

  return result == true;
}

Future<bool> showCreateTransactionSheet(
  BuildContext context, {
  required String wsId,
  required FinanceRepository repository,
  required TransactionCreateHandler onCreate,
  List<ExchangeRate>? exchangeRates,
}) async {
  final result = await showAdaptiveSheet<bool>(
    context: context,
    builder: (_) => _TransactionFormDialog(
      wsId: wsId,
      repository: repository,
      onCreate: onCreate,
      exchangeRates: exchangeRates,
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
    this.workspaceCurrency,
    this.exchangeRates,
  });

  final String wsId;
  final Transaction transaction;
  final FinanceRepository repository;
  final TransactionSaveHandler onSave;
  final Future<void> Function(String transactionId) onDelete;
  final String? workspaceCurrency;
  final List<ExchangeRate>? exchangeRates;

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
    final wsCurrency = widget.workspaceCurrency ?? 'USD';
    final exchangeRates = widget.exchangeRates ?? const [];
    final convertedAmount = convertCurrency(
      amount,
      currency,
      wsCurrency,
      exchangeRates,
    );
    final showConvertedAmount =
        convertedAmount != null &&
        currency.toUpperCase() != wsCurrency.toUpperCase();
    final date = _transaction.takenAt ?? _transaction.createdAt;
    final dateText = date != null
        ? DateFormat.yMMMd().add_jm().format(date.toLocal())
        : '-';
    final categoryColor =
        _parseHexColor(_transaction.categoryColor) ??
        (isExpense ? theme.colorScheme.destructive : theme.colorScheme.primary);
    final categoryIcon = resolvePlatformIcon(
      _transaction.categoryIcon,
      fallback: isExpense ? Icons.arrow_downward : Icons.arrow_upward,
    );

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
              valueChild: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${isExpense ? '' : '+'}'
                    '${formatCurrency(amount, currency)}',
                    style: theme.typography.base.copyWith(
                      fontWeight: FontWeight.w600,
                      color: isExpense
                          ? theme.colorScheme.destructive
                          : theme.colorScheme.primary,
                    ),
                  ),
                  if (showConvertedAmount) ...[
                    const shad.Gap(4),
                    Text(
                      '≈ ${convertedAmount >= 0 ? '+' : ''}'
                      '${formatCurrency(convertedAmount, wsCurrency)}',
                      style: theme.typography.small.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ],
              ),
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
              valueChild: _DetailValueWithIcon(
                leading: Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: categoryColor.withValues(alpha: 0.16),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(categoryIcon, size: 13, color: categoryColor),
                ),
                value: _transaction.categoryName ?? '-',
              ),
            ),
            const shad.Gap(12),
            _DetailRow(
              label: l10n.financeWallet,
              valueChild: _DetailValueWithIcon(
                leading: WalletVisualAvatar(
                  icon: _transaction.walletIcon,
                  imageSrc: _transaction.walletImageSrc,
                  fallbackIcon: Icons.wallet_outlined,
                  size: 24,
                ),
                value: _transaction.walletName ?? '-',
              ),
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
      builder: (_) => _TransactionFormDialog(
        wsId: widget.wsId,
        transaction: _transaction,
        repository: widget.repository,
        onSave: widget.onSave,
        exchangeRates: widget.exchangeRates,
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
    this.value,
    this.valueChild,
  }) : assert(
         (value == null) ^ (valueChild == null),
         'Either value or valueChild must be provided, but not both.',
       );

  final String label;
  final String? value;
  final Widget? valueChild;

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
          child:
              valueChild ??
              Text(
                value!,
                style: theme.typography.base,
              ),
        ),
      ],
    );
  }
}

class _DetailValueWithIcon extends StatelessWidget {
  const _DetailValueWithIcon({
    required this.leading,
    required this.value,
  });

  final Widget leading;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        leading,
        const shad.Gap(8),
        Expanded(
          child: Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: shad.Theme.of(context).typography.base.copyWith(
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
