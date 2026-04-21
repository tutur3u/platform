import 'dart:async';

import 'package:flutter/material.dart' hide AlertDialog, TextField;
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:intl/number_symbols.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/tag.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/utils/transaction_icon.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
part 'transaction_detail_sheet_amount_parsing.dart';
part 'transaction_detail_sheet_edit_dialog.dart';
part 'transaction_detail_sheet_edit_dialog_logic.dart';
part 'transaction_detail_sheet_edit_dialog_widgets.dart';

typedef TransactionSaveHandler =
    Future<Transaction> Function({
      required String transactionId,
      required double amount,
      String? description,
      DateTime? takenAt,
      String? walletId,
      String? categoryId,
      List<String>? tagIds,
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
      List<String>? tagIds,
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
  String? initialWalletId,
}) async {
  final result = await _showTransactionComposerRoute<bool>(
    context,
    child: _TransactionFormDialog(
      wsId: wsId,
      repository: repository,
      onCreate: onCreate,
      exchangeRates: exchangeRates,
      initialWalletId: initialWalletId,
    ),
  );

  return result == true;
}

Future<T?> _showTransactionComposerRoute<T>(
  BuildContext context, {
  required Widget child,
}) {
  return Navigator.of(context, rootNavigator: true).push<T>(
    MaterialPageRoute<T>(
      fullscreenDialog: true,
      builder: (_) => child,
    ),
  );
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
  bool _isQuickSaving = false;
  bool _didMutate = false;
  bool _isClosing = false;

  List<String> get _tagIds =>
      _transaction.tags.map((tag) => tag.id).toList(growable: false);

  DateTime get _effectiveTakenAt =>
      _transaction.takenAt ?? _transaction.createdAt ?? DateTime.now();

  bool get _isTransferOrigin => _transaction.transfer?.isOrigin ?? false;

  String? get _transferOriginWalletId => _isTransferOrigin
      ? _transaction.walletId
      : _transaction.transfer?.linkedWalletId;

  String? get _transferDestinationWalletId => _isTransferOrigin
      ? _transaction.transfer?.linkedWalletId
      : _transaction.walletId;

  String _transferRouteLabel(Transaction transaction) {
    final transfer = transaction.transfer;
    if (transfer == null) {
      return transaction.walletName ?? context.l10n.financeTransfer;
    }

    final sourceWalletName = transfer.isOrigin
        ? (transaction.walletName ?? '-')
        : transfer.linkedWalletName;
    final destinationWalletName = transfer.isOrigin
        ? transfer.linkedWalletName
        : (transaction.walletName ?? '-');

    return '$sourceWalletName → $destinationWalletName';
  }

  double _transferSourceAmountAbs(Transaction transaction) {
    final transfer = transaction.transfer;
    final amount = transaction.amount?.abs() ?? 0;
    if (transfer == null) {
      return amount;
    }

    return transfer.isOrigin
        ? amount
        : (transfer.linkedAmount?.abs() ?? amount);
  }

  double _transferDestinationAmountAbs(
    Transaction transaction, {
    Wallet? originWallet,
    Wallet? destinationWallet,
  }) {
    final transfer = transaction.transfer;
    final amount = transaction.amount?.abs() ?? 0;
    if (transfer == null) {
      return amount;
    }

    final sourceAmount = _transferSourceAmountAbs(transaction);
    final currentDestinationAmount = transfer.isOrigin
        ? (transfer.linkedAmount?.abs() ?? sourceAmount)
        : amount;
    final nextOriginCurrency =
        originWallet?.currency ??
        (transfer.isOrigin
            ? transaction.walletCurrency
            : transfer.linkedWalletCurrency);
    final nextDestinationCurrency =
        destinationWallet?.currency ??
        (transfer.isOrigin
            ? transfer.linkedWalletCurrency
            : transaction.walletCurrency);
    final isCrossCurrency =
        nextOriginCurrency?.toUpperCase() !=
        nextDestinationCurrency?.toUpperCase();

    return isCrossCurrency ? currentDestinationAmount : sourceAmount;
  }

  Future<void> _runQuickUpdate(Future<void> Function() callback) async {
    if (_isQuickSaving) {
      return;
    }

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    setState(() => _isQuickSaving = true);

    try {
      await callback();
      if (!mounted) {
        return;
      }

      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert(
            content: Text(ctx.l10n.financeTransactionUpdated),
          ),
        );
      }
    } on ApiException catch (error) {
      if (toastContext.mounted) {
        final message = error.message.trim();
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            content: Text(
              message.isEmpty ? ctx.l10n.commonSomethingWentWrong : message,
            ),
          ),
        );
      }
    } on Exception {
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            content: Text(ctx.l10n.commonSomethingWentWrong),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isQuickSaving = false);
      }
    }
  }

  void _closeSheet([bool? result]) {
    if (_isClosing || !mounted) {
      return;
    }

    _isClosing = true;
    Navigator.of(context).pop(result ?? _didMutate);
  }

  Future<void> _quickUpdateTransaction({
    Wallet? wallet,
    TransactionCategory? category,
    DateTime? takenAt,
    bool? reportOptIn,
    List<FinanceTag>? tags,
  }) async {
    await _runQuickUpdate(() async {
      final nextCategory = category;
      final nextTagIds = tags?.map((tag) => tag.id).toList(growable: false);
      final nextAmount = nextCategory == null
          ? (_transaction.amount ?? 0)
          : (nextCategory.isExpense != false
                ? -(_transaction.amount ?? 0).abs()
                : (_transaction.amount ?? 0).abs());

      final updated = await widget.onSave(
        transactionId: _transaction.id,
        amount: nextAmount,
        description: _transaction.description,
        takenAt: takenAt ?? _transaction.takenAt,
        walletId: wallet?.id ?? _transaction.walletId,
        categoryId: category?.id ?? _transaction.categoryId,
        tagIds: nextTagIds ?? _tagIds,
        reportOptIn: reportOptIn ?? _transaction.reportOptIn,
        isAmountConfidential: _transaction.isAmountConfidential,
        isDescriptionConfidential: _transaction.isDescriptionConfidential,
        isCategoryConfidential: _transaction.isCategoryConfidential,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _transaction = updated;
        _didMutate = true;
      });
    });
  }

  Future<void> _quickUpdateTransfer({
    Wallet? originWallet,
    Wallet? destinationWallet,
    DateTime? takenAt,
    bool? reportOptIn,
    List<FinanceTag>? tags,
  }) async {
    final transfer = _transaction.transfer;
    if (transfer == null) {
      return;
    }

    final resolvedOriginWalletId = originWallet?.id ?? _transferOriginWalletId;
    final resolvedDestinationWalletId =
        destinationWallet?.id ?? _transferDestinationWalletId;

    if (resolvedOriginWalletId == null || resolvedDestinationWalletId == null) {
      return;
    }

    final sourceAmount = _transferSourceAmountAbs(_transaction);
    final destinationAmount = _transferDestinationAmountAbs(
      _transaction,
      originWallet: originWallet,
      destinationWallet: destinationWallet,
    );

    await _runQuickUpdate(() async {
      final nextTagIds = tags?.map((tag) => tag.id).toList(growable: false);
      final updated = await widget.repository.updateTransfer(
        wsId: widget.wsId,
        originTransactionId: _isTransferOrigin
            ? _transaction.id
            : transfer.linkedTransactionId,
        destinationTransactionId: _isTransferOrigin
            ? transfer.linkedTransactionId
            : _transaction.id,
        originWalletId: resolvedOriginWalletId,
        destinationWalletId: resolvedDestinationWalletId,
        amount: sourceAmount,
        destinationAmount: destinationAmount,
        description: _transaction.description,
        takenAt: takenAt ?? _effectiveTakenAt,
        reportOptIn: reportOptIn ?? _transaction.reportOptIn,
        tagIds: nextTagIds ?? _tagIds,
        refreshedTransactionId: _transaction.id,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _transaction = updated;
        _didMutate = true;
      });
    });
  }

  Future<void> _showWalletQuickAction() async {
    final wallets = await widget.repository.getWallets(widget.wsId);
    if (!mounted || wallets.isEmpty) {
      return;
    }

    if (_transaction.isTransfer) {
      final selectedOriginWalletId = await showFinanceModal<String?>(
        context: context,
        builder: (_) => _WalletPickerDialog(
          wallets: wallets,
          title: context.l10n.financeWallet,
        ),
      );
      if (selectedOriginWalletId == null || !mounted) {
        return;
      }

      final selectedDestinationWalletId = await showFinanceModal<String?>(
        context: context,
        builder: (_) => _WalletPickerDialog(
          wallets: wallets,
          title: context.l10n.financeDestinationWallet,
          excludeWalletId: selectedOriginWalletId,
        ),
      );
      if (selectedDestinationWalletId == null || !mounted) {
        return;
      }

      final originWallet = wallets
          .where((wallet) => wallet.id == selectedOriginWalletId)
          .firstOrNull;
      final destinationWallet = wallets
          .where((wallet) => wallet.id == selectedDestinationWalletId)
          .firstOrNull;

      if (originWallet == null || destinationWallet == null) {
        return;
      }

      await _quickUpdateTransfer(
        originWallet: originWallet,
        destinationWallet: destinationWallet,
      );
      return;
    }

    final selectedWalletId = await showFinanceModal<String?>(
      context: context,
      builder: (_) => _WalletPickerDialog(
        wallets: wallets,
        title: context.l10n.financeWallet,
      ),
    );
    if (selectedWalletId == null || !mounted) {
      return;
    }

    final wallet = wallets
        .where((candidate) => candidate.id == selectedWalletId)
        .firstOrNull;
    if (wallet == null) {
      return;
    }

    await _quickUpdateTransaction(wallet: wallet);
  }

  Future<void> _showCategoryQuickAction() async {
    if (_transaction.isTransfer) {
      return;
    }

    final categories = await widget.repository.getCategories(widget.wsId);
    if (!mounted || categories.isEmpty) {
      return;
    }

    final selectedCategoryId = await showFinanceModal<String?>(
      context: context,
      builder: (_) => _CategoryPickerDialog(
        categories: categories,
        categoryColor: (category) {
          final parsed = _parseHexColor(category.color);
          if (parsed != null) {
            return parsed;
          }

          final colorScheme = shad.Theme.of(context).colorScheme;
          return category.isExpense != false
              ? colorScheme.destructive
              : colorScheme.primary;
        },
      ),
    );
    if (selectedCategoryId == null || !mounted) {
      return;
    }

    final category = categories
        .where((candidate) => candidate.id == selectedCategoryId)
        .firstOrNull;
    if (category == null) {
      return;
    }

    await _quickUpdateTransaction(category: category);
  }

  Future<void> _showTakenAtQuickAction() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _effectiveTakenAt,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (date == null || !mounted) {
      return;
    }

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_effectiveTakenAt),
    );
    if (time == null || !mounted) {
      return;
    }

    final nextTakenAt = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );

    if (_transaction.isTransfer) {
      await _quickUpdateTransfer(takenAt: nextTakenAt);
      return;
    }

    await _quickUpdateTransaction(takenAt: nextTakenAt);
  }

  Future<void> _showTagQuickAction() async {
    final tags = await widget.repository.getTags(widget.wsId);
    if (!mounted || tags.isEmpty) {
      return;
    }

    final selectedTagIds = await showFinanceModal<List<String>?>(
      context: context,
      builder: (_) => _TagPickerDialog(
        tags: tags,
        selectedTagIds: _tagIds,
        tagColor: (tag) {
          final parsed = _parseHexColor(tag.color);
          if (parsed != null) {
            return parsed;
          }

          return shad.Theme.of(context).colorScheme.primary;
        },
      ),
    );
    if (selectedTagIds == null || !mounted) {
      return;
    }

    final selected = selectedTagIds.toSet();
    final selectedTags = tags
        .where((tag) => selected.contains(tag.id))
        .toList(growable: false);

    if (_transaction.isTransfer) {
      await _quickUpdateTransfer(tags: selectedTags);
      return;
    }

    await _quickUpdateTransaction(tags: selectedTags);
  }

  Future<void> _toggleReportOptIn(bool value) async {
    if (_transaction.isTransfer) {
      await _quickUpdateTransfer(reportOptIn: value);
      return;
    }

    await _quickUpdateTransaction(reportOptIn: value);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final isSyntheticTransfer = _transaction.transfer?.isSynthetic ?? false;
    final showAmounts = context.select<FinancePreferencesCubit?, bool>(
      (cubit) => cubit?.state.showAmounts ?? false,
    );
    final date = _transaction.takenAt ?? _transaction.createdAt;
    final dateText = date != null
        ? DateFormat.yMMMd().add_jm().format(date.toLocal())
        : '-';
    final tagText = _transaction.tags.isEmpty
        ? l10n.financeNoTag
        : _transaction.tags.map((tag) => tag.name).join(', ');
    final excludedReportColor = theme.colorScheme.mutedForeground.withValues(
      alpha: 0.72,
    );
    final categoryIcon = resolveTransactionCategoryIcon(_transaction);
    final privacyChips = <Widget>[
      if (_transaction.reportOptIn == true)
        _DetailChip(
          icon: Icons.insights_outlined,
          label: l10n.financeReportOptIn,
          color: theme.colorScheme.primary,
        )
      else
        _DetailChip(
          icon: Icons.insights_outlined,
          label: l10n.financeExcludedFromReports,
          color: excludedReportColor,
        ),
      if (_transaction.isAmountConfidential == true)
        _DetailChip(
          icon: Icons.visibility_off_outlined,
          label: l10n.financeConfidentialAmount,
          color: theme.colorScheme.destructive,
        ),
      if (_transaction.isDescriptionConfidential == true)
        _DetailChip(
          icon: Icons.notes_outlined,
          label: l10n.financeConfidentialDescription,
          color: theme.colorScheme.destructive,
        ),
      if (_transaction.isCategoryConfidential == true)
        _DetailChip(
          icon: Icons.category_outlined,
          label: l10n.financeConfidentialCategory,
          color: theme.colorScheme.destructive,
        ),
    ];

    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop || _isClosing) {
          return;
        }
        _closeSheet(result is bool ? result : null);
      },
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.background,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 32),
          child: Column(
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
              const shad.Gap(18),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      l10n.financeTransactionDetails,
                      style: theme.typography.h4.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  shad.GhostButton(
                    onPressed: isSyntheticTransfer ? null : _showEditDialog,
                    child: const Icon(Icons.edit_outlined, size: 18),
                  ),
                ],
              ),
              const shad.Gap(16),
              _TransactionSummaryCard(
                transaction: _transaction,
                workspaceCurrency: widget.workspaceCurrency ?? 'USD',
                exchangeRates: widget.exchangeRates ?? const [],
                showAmounts: showAmounts,
              ),
              const shad.Gap(14),
              _DetailSectionCard(
                title: l10n.financeQuickActions,
                child: Column(
                  children: [
                    _QuickActionTile(
                      icon: _transaction.isTransfer
                          ? Icons.swap_horiz_rounded
                          : Icons.account_balance_wallet_outlined,
                      label: _transaction.isTransfer
                          ? l10n.financeWallets
                          : l10n.financeWallet,
                      value: _transaction.isTransfer
                          ? _transferRouteLabel(_transaction)
                          : (_transaction.walletName ?? '-'),
                      onTap: _isQuickSaving || isSyntheticTransfer
                          ? null
                          : _showWalletQuickAction,
                    ),
                    if (!_transaction.isTransfer) ...[
                      const shad.Gap(10),
                      _QuickActionTile(
                        icon: categoryIcon,
                        label: l10n.financeCategory,
                        value: _transaction.categoryName ?? '-',
                        onTap: _isQuickSaving || isSyntheticTransfer
                            ? null
                            : _showCategoryQuickAction,
                      ),
                    ],
                    const shad.Gap(10),
                    _QuickActionTile(
                      icon: Icons.sell_outlined,
                      label: l10n.financeTags,
                      value: tagText,
                      onTap: _isQuickSaving || isSyntheticTransfer
                          ? null
                          : _showTagQuickAction,
                    ),
                    const shad.Gap(10),
                    _QuickActionTile(
                      icon: Icons.schedule_rounded,
                      label: l10n.financeTakenAt,
                      value: dateText,
                      onTap: _isQuickSaving || isSyntheticTransfer
                          ? null
                          : _showTakenAtQuickAction,
                    ),
                    const shad.Gap(10),
                    _QuickActionToggleTile(
                      icon: Icons.insights_outlined,
                      label: l10n.financeReportOptIn,
                      value: _transaction.reportOptIn == true,
                      enabled: !_isQuickSaving && !isSyntheticTransfer,
                      activeLabel: l10n.financeReportOptIn,
                      inactiveLabel: l10n.financeExcludedFromReports,
                      onChanged: _toggleReportOptIn,
                    ),
                  ],
                ),
              ),
              if (privacyChips.isNotEmpty) ...[
                const shad.Gap(14),
                _DetailSectionCard(
                  title: l10n.settingsTitle,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: privacyChips,
                  ),
                ),
              ],
              const shad.Gap(18),
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
          _closeSheet(true);
        },
      ),
    );
  }

  Future<void> _showEditDialog() async {
    final rootNav = Navigator.of(context, rootNavigator: true);
    final toastContext = rootNav.context;
    final updated = await _showTransactionComposerRoute<Transaction>(
      context,
      child: _TransactionFormDialog(
        wsId: widget.wsId,
        transaction: _transaction,
        repository: widget.repository,
        onSave: widget.onSave,
        exchangeRates: widget.exchangeRates,
      ),
    );

    if (updated == null || !mounted) return;

    setState(() => _transaction = updated);
    if (toastContext.mounted) {
      shad.showToast(
        context: toastContext,
        builder: (ctx, overlay) => shad.Alert(
          content: Text(ctx.l10n.financeTransactionUpdated),
        ),
      );
    }
    _closeSheet(true);
  }
}

class _TransactionSummaryCard extends StatelessWidget {
  const _TransactionSummaryCard({
    required this.transaction,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.showAmounts,
  });

  final Transaction transaction;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final bool showAmounts;

  String _sourceWalletName() {
    final transfer = transaction.transfer;
    if (transfer == null) {
      return transaction.walletName ?? '-';
    }

    return transfer.isOrigin
        ? (transaction.walletName ?? '-')
        : transfer.linkedWalletName;
  }

  String _destinationWalletName() {
    final transfer = transaction.transfer;
    if (transfer == null) {
      return transaction.walletName ?? '-';
    }

    return transfer.isOrigin
        ? transfer.linkedWalletName
        : (transaction.walletName ?? '-');
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final colorScheme = theme.colorScheme;
    final amount = transaction.amount ?? 0;
    final isExpense = amount < 0;
    final isTransfer = transaction.isTransfer;
    final currency = transaction.walletCurrency ?? workspaceCurrency;
    final convertedAmount = convertCurrency(
      amount,
      currency,
      workspaceCurrency,
      exchangeRates,
    );
    final showConvertedAmount =
        convertedAmount != null &&
        currency.toUpperCase() != workspaceCurrency.toUpperCase();
    final excludedReportColor = colorScheme.mutedForeground.withValues(
      alpha: 0.72,
    );
    final rawDescription = transaction.description?.trim();
    final hasDescription = rawDescription?.isNotEmpty ?? false;
    final title = isTransfer
        ? '${_sourceWalletName()} → ${_destinationWalletName()}'
        : (transaction.categoryName ?? rawDescription ?? '—');
    final description = isTransfer
        ? (hasDescription ? rawDescription : null)
        : (hasDescription && rawDescription != title ? rawDescription : null);
    final categoryColor =
        _parseHexColor(transaction.categoryColor) ??
        (isTransfer
            ? palette.accent
            : (isExpense ? palette.negative : palette.positive));
    final amountText = maskFinanceValue(
      isExpense
          ? formatCurrency(amount, currency)
          : '+${formatCurrency(amount, currency)}',
      showAmounts: showAmounts,
    );
    final convertedAmountText = showConvertedAmount
        ? maskFinanceValue(
            convertedAmount >= 0
                ? '≈ +${formatCurrency(convertedAmount, workspaceCurrency)}'
                : '≈ ${formatCurrency(convertedAmount, workspaceCurrency)}',
            showAmounts: showAmounts,
          )
        : null;
    final transferLinkedAmountText =
        isTransfer &&
            transaction.transfer?.linkedAmount != null &&
            transaction.transfer?.linkedWalletCurrency != null &&
            transaction.transfer!.linkedWalletCurrency!.toUpperCase() !=
                currency.toUpperCase()
        ? maskFinanceValue(
            formatCurrency(
              transaction.transfer!.linkedAmount!,
              transaction.transfer!.linkedWalletCurrency!,
            ),
            showAmounts: showAmounts,
          )
        : null;
    final categoryIcon = resolveTransactionCategoryIcon(transaction);

    return FinancePanel(
      radius: 20,
      borderColor: categoryColor.withValues(alpha: 0.28),
      padding: const EdgeInsets.all(14),
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: categoryColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  categoryIcon,
                  size: 18,
                  color: categoryColor,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Align(
                  alignment: Alignment.topRight,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        amountText,
                        maxLines: 1,
                        style: theme.typography.large.copyWith(
                          fontWeight: FontWeight.w900,
                          color: isTransfer
                              ? palette.accent
                              : isExpense
                              ? palette.negative
                              : palette.positive,
                        ),
                      ),
                      if (transferLinkedAmountText != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          transferLinkedAmountText,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ] else if (convertedAmountText != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          convertedAmountText,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w700,
              height: 1.3,
            ),
          ),
          if (description != null) ...[
            const SizedBox(height: 4),
            Text(
              description,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.xSmall.copyWith(
                color: colorScheme.mutedForeground,
                height: 1.3,
              ),
            ),
          ],
          if (isTransfer ||
              transaction.categoryName != null ||
              transaction.walletName != null) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                if (isTransfer)
                  _SummaryChip(
                    label: context.l10n.financeTransfer,
                    icon: categoryIcon,
                    color: categoryColor,
                  ),
                if (!isTransfer && transaction.categoryName != null)
                  _SummaryChip(
                    label: transaction.categoryName!,
                    icon: categoryIcon,
                    color: categoryColor,
                  ),
                if (!isTransfer && transaction.walletName != null)
                  _SummaryChip(
                    label: transaction.walletName!,
                    leading: WalletVisualAvatar(
                      icon: transaction.walletIcon,
                      imageSrc: transaction.walletImageSrc,
                      fallbackIcon: Icons.account_balance_wallet_outlined,
                      size: 14,
                    ),
                  ),
              ],
            ),
          ],
          if (transaction.tags.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: transaction.tags.map((tag) {
                final tagColor =
                    _parseHexColor(tag.color) ??
                    FinancePalette.of(context).accent;
                return Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 7,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: tagColor.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    tag.name,
                    style: theme.typography.xSmall.copyWith(
                      color: tagColor,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
          if (convertedAmountText != null ||
              transaction.reportOptIn != true) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              runSpacing: 4,
              children: [
                if (transaction.reportOptIn != true)
                  _MutedInlineInfo(
                    icon: Icons.insights_outlined,
                    label: context.l10n.financeExcludedFromReports,
                    color: excludedReportColor,
                  ),
                if (convertedAmountText != null)
                  _MutedInlineInfo(
                    icon: Icons.currency_exchange_rounded,
                    label: convertedAmountText,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _SummaryChip extends StatelessWidget {
  const _SummaryChip({
    required this.label,
    this.icon,
    this.leading,
    this.color,
  });

  final String label;
  final IconData? icon;
  final Widget? leading;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final effectiveColor = color ?? theme.colorScheme.mutedForeground;
    final availableWidth = MediaQuery.sizeOf(context).width - 88;
    final maxWidth = availableWidth > 180 ? availableWidth : 180.0;

    return Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
      decoration: BoxDecoration(
        color: effectiveColor.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: effectiveColor.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[
            leading!,
            const SizedBox(width: 4),
          ] else if (icon != null) ...[
            Icon(
              icon,
              size: 11,
              color: effectiveColor.withValues(alpha: 0.8),
            ),
            const SizedBox(width: 3),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.xSmall.copyWith(
                color: effectiveColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MutedInlineInfo extends StatelessWidget {
  const _MutedInlineInfo({
    required this.icon,
    required this.label,
    this.color,
  });

  final IconData icon;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final resolvedColor = color ?? theme.colorScheme.mutedForeground;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: resolvedColor),
        const SizedBox(width: 4),
        Text(
          label,
          style: theme.typography.xSmall.copyWith(
            color: resolvedColor,
          ),
        ),
      ],
    );
  }
}

class _DetailSectionCard extends StatelessWidget {
  const _DetailSectionCard({
    required this.title,
    required this.child,
  });

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: shad.Theme.of(context).typography.small.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const shad.Gap(14),
          child,
        ],
      ),
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  const _QuickActionTile({
    required this.icon,
    required this.label,
    required this.value,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.colorScheme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  size: 16,
                  color: theme.colorScheme.primary,
                ),
              ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: theme.typography.xSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.35,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(
                      value,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const shad.Gap(10),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickActionToggleTile extends StatelessWidget {
  const _QuickActionToggleTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.enabled,
    required this.activeLabel,
    required this.inactiveLabel,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final bool value;
  final bool enabled;
  final String activeLabel;
  final String inactiveLabel;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = value
        ? theme.colorScheme.primary
        : theme.colorScheme.mutedForeground;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: accent.withValues(alpha: value ? 0.36 : 0.18),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 16, color: accent),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.35,
                  ),
                ),
                const shad.Gap(4),
                Text(
                  value ? activeLabel : inactiveLabel,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          shad.Switch(
            value: value,
            onChanged: enabled ? onChanged : null,
          ),
        ],
      ),
    );
  }
}

class _DetailChip extends StatelessWidget {
  const _DetailChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const shad.Gap(6),
          Text(
            label,
            style: shad.Theme.of(context).typography.xSmall.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
