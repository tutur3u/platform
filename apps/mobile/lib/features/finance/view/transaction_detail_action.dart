import 'package:flutter/material.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';

Future<bool> openTransactionDetailSheet(
  BuildContext context, {
  required String wsId,
  required Transaction transaction,
  required FinanceRepository repository,
  String? workspaceCurrency,
  List<ExchangeRate>? exchangeRates,
}) {
  return showTransactionDetailSheet(
    context,
    wsId: wsId,
    transaction: transaction,
    repository: repository,
    workspaceCurrency: workspaceCurrency,
    exchangeRates: exchangeRates,
    onSave:
        ({
          required transactionId,
          required amount,
          description,
          takenAt,
          walletId,
          categoryId,
          reportOptIn,
          isAmountConfidential,
          isDescriptionConfidential,
          isCategoryConfidential,
        }) {
          return repository.updateTransaction(
            wsId: wsId,
            transactionId: transactionId,
            amount: amount,
            description: description,
            takenAt: takenAt,
            walletId: walletId,
            categoryId: categoryId,
            reportOptIn: reportOptIn,
            isAmountConfidential: isAmountConfidential,
            isDescriptionConfidential: isDescriptionConfidential,
            isCategoryConfidential: isCategoryConfidential,
          );
        },
    onDelete: (transactionId) {
      return repository.deleteTransaction(
        wsId: wsId,
        transactionId: transactionId,
      );
    },
  );
}

Future<bool> openCreateTransactionSheet(
  BuildContext context, {
  required String wsId,
  required FinanceRepository repository,
  List<ExchangeRate>? exchangeRates,
}) {
  return showCreateTransactionSheet(
    context,
    wsId: wsId,
    repository: repository,
    exchangeRates: exchangeRates,
    onCreate:
        ({
          required amount,
          description,
          takenAt,
          walletId,
          categoryId,
          reportOptIn,
          isAmountConfidential,
          isDescriptionConfidential,
          isCategoryConfidential,
        }) {
          if (walletId == null) {
            throw ArgumentError(
              'walletId must not be null when creating a transaction',
            );
          }

          return repository.createTransaction(
            wsId: wsId,
            amount: amount,
            description: description,
            takenAt: takenAt ?? DateTime.now(),
            walletId: walletId,
            categoryId: categoryId,
            reportOptIn: reportOptIn,
            isAmountConfidential: isAmountConfidential,
            isDescriptionConfidential: isDescriptionConfidential,
            isCategoryConfidential: isCategoryConfidential,
          );
        },
  );
}
