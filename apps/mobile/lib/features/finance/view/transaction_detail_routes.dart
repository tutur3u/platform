part of 'transaction_detail_sheet.dart';

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
  DateTime? initialTakenAt,
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
