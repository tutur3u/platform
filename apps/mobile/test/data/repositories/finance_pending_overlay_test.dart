import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_pending_overlay.dart';

void main() {
  PendingMutationRecord record({
    required String method,
    required String path,
    required String id,
    Map<String, dynamic>? payload,
  }) => PendingMutationRecord(
    id: 'mutation-$id',
    feature: 'finance',
    method: method,
    path: path,
    createdAt: DateTime.utc(2026, 9, 28),
    userId: 'user',
    workspaceId: 'workspace',
    payload: payload,
    optimisticPatch: {'entityId': id},
  );

  test('ordering uses each rows creation time when taken time is absent', () {
    final rows = overlayPendingTransactions('workspace', [
      Transaction(id: 'older', takenAt: DateTime.utc(2026)),
      Transaction(id: 'newer', createdAt: DateTime.utc(2026, 2)),
    ], []);
    expect(rows.map((row) => row.id), ['newer', 'older']);
  });

  test('attachment and checkpoint edits do not mutate parent collections', () {
    final attachment = record(
      method: 'DELETE',
      path:
          '/api/workspaces/workspace/transactions/transaction/attachments/file',
      id: 'transaction',
    );
    expect(
      overlayPendingTransactions(
        'workspace',
        const [Transaction(id: 'transaction')],
        [attachment],
      ).single.id,
      'transaction',
    );
    final checkpoint = record(
      method: 'POST',
      path: '/api/workspaces/workspace/wallets/wallet/checkpoints',
      id: 'checkpoint',
      payload: {'actual_balance': 50},
    );
    expect(
      overlayPendingWallets(
        'workspace',
        const [Wallet(id: 'wallet', name: 'Wallet')],
        [checkpoint],
      ).single.id,
      'wallet',
    );
  });

  test('pending wallet create and delete update the visible list', () {
    final wallets = overlayPendingWallets('workspace', [], [
      record(
        method: 'POST',
        path: '/api/workspaces/workspace/wallets',
        id: 'wallet-1',
        payload: {'name': 'Cash', 'currency': 'USD'},
      ),
    ]);
    expect(wallets.single.name, 'Cash');
    expect(
      overlayPendingWallets('workspace', wallets, [
        record(
          method: 'DELETE',
          path: '/api/workspaces/workspace/wallets/wallet-1',
          id: 'wallet-1',
        ),
      ]),
      isEmpty,
    );
  });

  test('pending transaction create respects wallet and search filters', () {
    final pending = [
      record(
        method: 'POST',
        path: '/api/workspaces/workspace/transactions',
        id: 'transaction-1',
        payload: {
          'amount': -25,
          'description': 'Lunch',
          'origin_wallet_id': 'wallet-1',
        },
      ),
    ];
    expect(
      overlayPendingTransactions(
        'workspace',
        [],
        pending,
        walletId: 'wallet-1',
        search: 'lunch',
      ).single.amount,
      -25,
    );
    expect(
      overlayPendingTransactions(
        'workspace',
        [],
        pending,
        walletId: 'wallet-2',
      ),
      isEmpty,
    );
  });

  test('pending transfer appears in the receiving wallet with its own ID', () {
    final pending = [
      record(
        method: 'POST',
        path: '/api/workspaces/workspace/transfers',
        id: 'origin-1',
        payload: {
          'amount': 50,
          'destination_amount': 55,
          'origin_wallet_id': 'wallet-1',
          'destination_wallet_id': 'wallet-2',
          'client_destination_transaction_id': 'destination-1',
        },
      ),
    ];
    final received = overlayPendingTransactions(
      'workspace',
      [],
      pending,
      walletId: 'wallet-2',
    );
    expect(received.single.id, 'destination-1');
    expect(received.single.amount, 55);
  });
}
