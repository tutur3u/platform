part of 'transaction_detail_sheet.dart';

Future<bool> showTransactionDetailSheet(
  BuildContext context, {
  required String wsId,
  required Transaction transaction,
  required FinanceRepository repository,
  required TransactionSaveHandler onSave,
  required Future<void> Function(String transactionId) onDelete,
  bool canEdit = true,
  bool canDelete = true,
  String? workspaceCurrency,
  List<ExchangeRate>? exchangeRates,
}) async {
  final preferences = context.read<FinancePreferencesCubit?>();
  final sheet = _TransactionDetailSheet(
    wsId: wsId,
    transaction: transaction,
    repository: repository,
    onSave: onSave,
    onDelete: onDelete,
    canEdit: canEdit,
    canDelete: canDelete,
    workspaceCurrency: workspaceCurrency,
    exchangeRates: exchangeRates,
  );
  final result = await showAdaptiveSheet<bool>(
    context: context,
    builder: (_) => preferences == null
        ? sheet
        : BlocProvider.value(value: preferences, child: sheet),
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
  DateTime? initialTakenAt,
  bool initialTransfer = false,
}) async {
  final result = await _showTransactionComposerRoute<bool>(
    context,
    child: _TransactionFormDialog(
      wsId: wsId,
      repository: repository,
      onCreate: onCreate,
      exchangeRates: exchangeRates,
      initialWalletId: initialWalletId,
      initialTakenAt: initialTakenAt,
      initialTransfer: initialTransfer,
    ),
  );

  return result == true;
}

Future<T?> _showTransactionComposerRoute<T>(
  BuildContext context, {
  required Widget child,
}) {
  return Navigator.of(context, rootNavigator: true).push<T>(
    MaterialPageRoute<T>(fullscreenDialog: true, builder: (_) => child),
  );
}

extension on _TransactionDetailSheetState {
  Widget _deleteButton(BuildContext context) {
    final l10n = context.l10n;
    return shad.DestructiveButton(
      onPressed: _showDeleteConfirmation,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.delete_outline, size: 16),
          const shad.Gap(8),
          Text(l10n.financeDeleteTransaction),
        ],
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

    _applyEditedTransaction(updated);
    if (toastContext.mounted) {
      shad.showToast(
        context: toastContext,
        builder: (ctx, overlay) =>
            shad.Alert(content: Text(ctx.l10n.financeTransactionUpdated)),
      );
    }
    _closeSheet(true);
  }
}
