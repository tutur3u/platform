import 'dart:async';

import 'package:flutter/material.dart' hide AlertDialog, TextField;
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:intl/number_symbols.dart';
import 'package:mobile/core/icons/platform_icon.dart';
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
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final showAmounts = context.select<FinancePreferencesCubit?, bool>(
      (cubit) => cubit?.state.showAmounts ?? false,
    );
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
    final title = (_transaction.description?.trim().isNotEmpty ?? false)
        ? _transaction.description!.trim()
        : (_transaction.isTransfer
              ? l10n.financeTransfer
              : (_transaction.categoryName ?? _transaction.walletName ?? '—'));
    final subtitle = _transaction.isTransfer
        ? (_transaction.transfer == null
              ? dateText
              : (_transaction.transfer!.isOrigin
                    ? '${_transaction.walletName ?? '-'} → '
                          '${_transaction.transfer!.linkedWalletName}'
                    : '${_transaction.transfer!.linkedWalletName} → '
                          '${_transaction.walletName ?? '-'}'))
        : [
            if (_transaction.categoryName?.trim().isNotEmpty ?? false)
              _transaction.categoryName!.trim(),
            if (_transaction.walletName?.trim().isNotEmpty ?? false)
              _transaction.walletName!.trim(),
            dateText,
          ].join(' • ');
    final categoryColor =
        _parseHexColor(_transaction.categoryColor) ??
        (isExpense ? theme.colorScheme.destructive : theme.colorScheme.primary);
    final categoryIcon = resolvePlatformIcon(
      _transaction.categoryIcon,
      fallback: isExpense ? Icons.arrow_downward : Icons.arrow_upward,
    );
    final firstTag = _transaction.tags.firstOrNull;
    final tagColor =
        _parseHexColor(firstTag?.color) ?? theme.colorScheme.primary;
    final primaryAmountText = maskFinanceValue(
      '${isExpense ? '' : '+'}${formatCurrency(amount, currency)}',
      showAmounts: showAmounts,
    );
    final secondaryAmountText =
        _transaction.isTransfer &&
            _transaction.transfer?.linkedAmount != null &&
            _transaction.transfer?.linkedWalletCurrency != null &&
            _transaction.transfer!.linkedWalletCurrency!.toUpperCase() !=
                currency.toUpperCase()
        ? maskFinanceValue(
            formatCurrency(
              _transaction.transfer!.linkedAmount!,
              _transaction.transfer!.linkedWalletCurrency!,
            ),
            showAmounts: showAmounts,
          )
        : showConvertedAmount
        ? maskFinanceValue(
            '≈ ${convertedAmount >= 0 ? '+' : ''}'
            '${formatCurrency(convertedAmount, wsCurrency)}',
            showAmounts: showAmounts,
          )
        : null;
    final infoRows = <Widget>[
      _FactTile(
        label: l10n.financeTakenAt,
        value: dateText,
        icon: Icons.schedule_rounded,
      ),
      _FactTile(
        label: l10n.financeWallet,
        value: _transaction.walletName ?? '-',
        icon: Icons.account_balance_wallet_outlined,
      ),
      if (!_transaction.isTransfer)
        _FactTile(
          label: l10n.financeCategory,
          value: _transaction.categoryName ?? '-',
          icon: categoryIcon,
          iconColor: categoryColor,
        ),
    ];
    final privacyChips = <Widget>[
      if (_transaction.reportOptIn == true)
        _DetailChip(
          icon: Icons.insights_outlined,
          label: l10n.financeReportOptIn,
          color: theme.colorScheme.primary,
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

    return Container(
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
                    style: theme.typography.h3.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                shad.GhostButton(
                  onPressed: _showEditDialog,
                  child: const Icon(Icons.edit_outlined, size: 18),
                ),
              ],
            ),
            const shad.Gap(16),
            _TransactionDetailHero(
              title: title,
              subtitle: subtitle,
              primaryAmountText: primaryAmountText,
              secondaryAmountText: secondaryAmountText,
              accentColor: _transaction.isTransfer
                  ? theme.colorScheme.primary
                  : (isExpense
                        ? theme.colorScheme.destructive
                        : theme.colorScheme.primary),
              categoryColor: categoryColor,
              categoryIcon: categoryIcon,
              walletIcon: _transaction.walletIcon,
              walletImageSrc: _transaction.walletImageSrc,
              isTransfer: _transaction.isTransfer,
            ),
            if ((_transaction.description?.trim().isNotEmpty ?? false) &&
                title != _transaction.description!.trim()) ...[
              const shad.Gap(14),
              _DetailSectionCard(
                title: l10n.financeDescription,
                child: Text(
                  _transaction.description!.trim(),
                  style: theme.typography.small.copyWith(height: 1.5),
                ),
              ),
            ],
            const shad.Gap(14),
            _DetailSectionCard(
              title: l10n.financeTransactionDetails,
              child: Column(
                children: [
                  if (_transaction.isTransfer && _transaction.transfer != null)
                    _TransferRouteCard(
                      sourceWalletName: _transaction.transfer!.isOrigin
                          ? (_transaction.walletName ?? '-')
                          : _transaction.transfer!.linkedWalletName,
                      sourceWalletIcon: _transaction.transfer!.isOrigin
                          ? _transaction.walletIcon
                          : null,
                      sourceWalletImageSrc: _transaction.transfer!.isOrigin
                          ? _transaction.walletImageSrc
                          : null,
                      destinationWalletName: _transaction.transfer!.isOrigin
                          ? _transaction.transfer!.linkedWalletName
                          : (_transaction.walletName ?? '-'),
                      destinationWalletIcon: _transaction.transfer!.isOrigin
                          ? null
                          : _transaction.walletIcon,
                      destinationWalletImageSrc: _transaction.transfer!.isOrigin
                          ? null
                          : _transaction.walletImageSrc,
                      accentColor: theme.colorScheme.primary,
                    ),
                  if (_transaction.isTransfer && _transaction.transfer != null)
                    const shad.Gap(12),
                  for (var i = 0; i < infoRows.length; i++) ...[
                    infoRows[i],
                    if (i != infoRows.length - 1) const shad.Gap(10),
                  ],
                  if (_transaction.tags.isNotEmpty) ...[
                    const shad.Gap(12),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _transaction.tags.map((tag) {
                          final color = _parseHexColor(tag.color) ?? tagColor;
                          return _DetailChip(
                            icon: Icons.sell_outlined,
                            label: tag.name,
                            color: color,
                          );
                        }).toList(),
                      ),
                    ),
                  ],
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
    Navigator.of(context).pop(true);
  }
}

class _TransactionDetailHero extends StatelessWidget {
  const _TransactionDetailHero({
    required this.title,
    required this.subtitle,
    required this.primaryAmountText,
    required this.accentColor,
    required this.categoryColor,
    required this.categoryIcon,
    required this.isTransfer,
    this.secondaryAmountText,
    this.walletIcon,
    this.walletImageSrc,
  });

  final String title;
  final String subtitle;
  final String primaryAmountText;
  final String? secondaryAmountText;
  final Color accentColor;
  final Color categoryColor;
  final IconData categoryIcon;
  final String? walletIcon;
  final String? walletImageSrc;
  final bool isTransfer;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: accentColor.withValues(alpha: 0.18)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accentColor.withValues(alpha: 0.18),
            FinancePalette.of(context).panel,
            FinancePalette.of(context).elevatedPanel,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: categoryColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: isTransfer
                    ? WalletVisualAvatar(
                        icon: walletIcon,
                        imageSrc: walletImageSrc,
                        fallbackIcon: Icons.swap_horiz_rounded,
                        size: 24,
                        backgroundColor: Colors.transparent,
                      )
                    : Icon(categoryIcon, size: 22, color: categoryColor),
              ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (subtitle.trim().isNotEmpty) ...[
                      const shad.Gap(4),
                      Text(
                        subtitle,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const shad.Gap(18),
          Text(
            primaryAmountText,
            style: theme.typography.h2.copyWith(
              fontWeight: FontWeight.w900,
              color: accentColor,
              height: 1,
            ),
          ),
          if (secondaryAmountText != null) ...[
            const shad.Gap(6),
            Text(
              secondaryAmountText!,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
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

class _FactTile extends StatelessWidget {
  const _FactTile({
    required this.label,
    required this.value,
    required this.icon,
    this.iconColor,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final resolvedIconColor = iconColor ?? theme.colorScheme.primary;

    return Container(
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
              color: resolvedIconColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 16, color: resolvedIconColor),
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
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TransferRouteCard extends StatelessWidget {
  const _TransferRouteCard({
    required this.sourceWalletName,
    required this.destinationWalletName,
    required this.accentColor,
    this.sourceWalletIcon,
    this.sourceWalletImageSrc,
    this.destinationWalletIcon,
    this.destinationWalletImageSrc,
  });

  final String sourceWalletName;
  final String destinationWalletName;
  final Color accentColor;
  final String? sourceWalletIcon;
  final String? sourceWalletImageSrc;
  final String? destinationWalletIcon;
  final String? destinationWalletImageSrc;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: accentColor.withValues(alpha: 0.18)),
      ),
      child: Row(
        children: [
          Expanded(
            child: _TransferWalletPill(
              name: sourceWalletName,
              icon: sourceWalletIcon,
              imageSrc: sourceWalletImageSrc,
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Icon(
              Icons.arrow_forward_rounded,
              size: 18,
              color: accentColor,
            ),
          ),
          Expanded(
            child: _TransferWalletPill(
              name: destinationWalletName,
              icon: destinationWalletIcon,
              imageSrc: destinationWalletImageSrc,
            ),
          ),
        ],
      ),
    );
  }
}

class _TransferWalletPill extends StatelessWidget {
  const _TransferWalletPill({
    required this.name,
    this.icon,
    this.imageSrc,
  });

  final String name;
  final String? icon;
  final String? imageSrc;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        WalletVisualAvatar(
          icon: icon,
          imageSrc: imageSrc,
          fallbackIcon: Icons.account_balance_wallet_outlined,
          size: 24,
        ),
        const shad.Gap(8),
        Expanded(
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: shad.Theme.of(context).typography.small.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
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
