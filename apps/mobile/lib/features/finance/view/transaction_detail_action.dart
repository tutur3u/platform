import 'package:flutter/material.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/finance_cache.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';

Future<void> invalidateFinanceMutationCaches(String wsId) async {
  FinanceCubit.clearWorkspaceCache(wsId);
  await CacheStore.instance.invalidateTags(const [
    financeOverviewCacheTag,
    financeTransactionsCacheTag,
    financeWalletsCacheTag,
  ], workspaceId: wsId);
}

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
          tagIds,
          reportOptIn,
          isAmountConfidential,
          isDescriptionConfidential,
          isCategoryConfidential,
        }) async {
          final updated = await repository.updateTransaction(
            wsId: wsId,
            transactionId: transactionId,
            amount: amount,
            description: description,
            takenAt: takenAt,
            walletId: walletId,
            categoryId: categoryId,
            tagIds: tagIds,
            reportOptIn: reportOptIn,
            isAmountConfidential: isAmountConfidential,
            isDescriptionConfidential: isDescriptionConfidential,
            isCategoryConfidential: isCategoryConfidential,
          );
          await invalidateFinanceMutationCaches(wsId);
          return updated;
        },
    onDelete: (transactionId) async {
      await repository.deleteTransaction(
        wsId: wsId,
        transactionId: transactionId,
      );
      await invalidateFinanceMutationCaches(wsId);
    },
  );
}

Future<bool> openCreateTransactionSheet(
  BuildContext context, {
  required String wsId,
  required FinanceRepository repository,
  List<ExchangeRate>? exchangeRates,
  String? initialWalletId,
}) {
  return showCreateTransactionSheet(
    context,
    wsId: wsId,
    repository: repository,
    exchangeRates: exchangeRates,
    initialWalletId: initialWalletId,
    onCreate:
        ({
          required amount,
          description,
          takenAt,
          walletId,
          categoryId,
          tagIds,
          reportOptIn,
          isAmountConfidential,
          isDescriptionConfidential,
          isCategoryConfidential,
        }) async {
          if (walletId == null) {
            throw ArgumentError(
              'walletId must not be null when creating a transaction',
            );
          }

          final transactionId = await repository.createTransaction(
            wsId: wsId,
            amount: amount,
            description: description,
            takenAt: takenAt ?? DateTime.now(),
            walletId: walletId,
            categoryId: categoryId,
            tagIds: tagIds,
            reportOptIn: reportOptIn,
            isAmountConfidential: isAmountConfidential,
            isDescriptionConfidential: isDescriptionConfidential,
            isCategoryConfidential: isCategoryConfidential,
          );
          await invalidateFinanceMutationCaches(wsId);
          return transactionId;
        },
  );
}
