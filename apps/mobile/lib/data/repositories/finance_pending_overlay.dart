import 'package:mobile/core/cache/local_search.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';

List<Wallet> overlayPendingWallets(
  String workspaceId,
  List<Wallet> source,
  List<PendingMutationRecord> pending,
) {
  final rows = {for (final wallet in source) wallet.id: wallet};
  for (final mutation in pending) {
    if (mutation.feature != 'finance' ||
        mutation.workspaceId != workspaceId ||
        !(mutation.path == FinanceEndpoints.wallets(workspaceId) ||
            (mutation.entityId != null &&
                mutation.path ==
                    FinanceEndpoints.wallet(
                      workspaceId,
                      mutation.entityId!,
                    )))) {
      continue;
    }
    final id = mutation.entityId;
    if (id == null) continue;
    if (mutation.method == 'DELETE') {
      rows.remove(id);
    } else if (mutation.payload != null) {
      rows[id] = Wallet.fromJson({
        ...?rows[id]?.toJson(),
        ...mutation.payload!,
        'id': id,
        'ws_id': workspaceId,
      });
    }
  }
  return rows.values.toList(growable: false);
}

List<Transaction> overlayPendingTransactions(
  String workspaceId,
  List<Transaction> source,
  List<PendingMutationRecord> pending, {
  String? walletId,
  String? search,
}) {
  final rows = {for (final transaction in source) transaction.id: transaction};
  for (final mutation in pending) {
    if (mutation.feature != 'finance' ||
        mutation.workspaceId != workspaceId ||
        !(mutation.path == FinanceEndpoints.transactions(workspaceId) ||
            mutation.path == FinanceEndpoints.transfers(workspaceId) ||
            (mutation.entityId != null &&
                mutation.path ==
                    FinanceEndpoints.transaction(
                      workspaceId,
                      mutation.entityId!,
                    )))) {
      continue;
    }
    final originId = mutation.entityId;
    if (originId == null) continue;
    final payload = mutation.payload;
    final isNewTransfer =
        mutation.method == 'POST' && mutation.path.contains('/transfers');
    final isDestination =
        isNewTransfer &&
        walletId != null &&
        walletId == payload?['destination_wallet_id'];
    final id = isDestination
        ? (payload?['client_destination_transaction_id'] as String? ?? originId)
        : originId;
    if (mutation.method == 'DELETE') {
      rows.remove(id);
      continue;
    }
    if (payload == null) continue;
    final existing = rows[id];
    final resolvedWallet = isDestination
        ? payload['destination_wallet_id']
        : payload['origin_wallet_id'] ?? existing?.walletId;
    if (walletId != null && resolvedWallet != walletId) continue;
    final description =
        payload['description'] as String? ?? existing?.description ?? '';
    rows[id] = Transaction.fromJson({
      ...?existing?.toJson(),
      'id': id,
      'amount': isDestination
          ? payload['destination_amount'] ?? payload['amount']
          : mutation.path.contains('/transfers')
          ? (existing != null && existing.amount != null && existing.amount! > 0
                ? (payload['destination_amount'] as num? ??
                          payload['amount'] as num)
                      .abs()
                : -(payload['amount'] as num).abs())
          : payload['amount'] ?? existing?.amount,
      'wallet_id': resolvedWallet,
      'description': description,
      'category_id': payload['category_id'] ?? existing?.categoryId,
      'taken_at':
          payload['taken_at'] ??
          existing?.takenAt?.toIso8601String() ??
          mutation.createdAt.toIso8601String(),
      'created_at':
          existing?.createdAt?.toIso8601String() ??
          mutation.createdAt.toIso8601String(),
    });
  }
  final result =
      rows.values
          .where(
            (row) =>
                search == null ||
                search.isEmpty ||
                (row.description != '[CONFIDENTIAL]' &&
                    localIlike(row.description, search)),
          )
          .toList(growable: false)
        ..sort((a, b) {
          final taken = (b.takenAt ?? b.createdAt ?? DateTime(0)).compareTo(
            a.takenAt ?? a.createdAt ?? DateTime(0),
          );
          if (taken != 0) return taken;
          return (b.createdAt ?? DateTime(0)).compareTo(
            a.createdAt ?? DateTime(0),
          );
        });
  return result;
}
