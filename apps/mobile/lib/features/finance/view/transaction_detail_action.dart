import 'package:flutter/material.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';

Future<bool> openTransactionDetailSheet(
  BuildContext context, {
  required String wsId,
  required Transaction transaction,
  required FinanceRepository repository,
}) {
  return showTransactionDetailSheet(
    context,
    wsId: wsId,
    transaction: transaction,
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
