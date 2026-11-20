import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/features/finance/utils/checkpoint_wallets.dart';

WalletCheckpoint _checkpoint(String wallet, double variance, DateTime at) =>
    WalletCheckpoint(
      id: 'c-$wallet',
      walletId: wallet,
      actualBalance: 100 + variance,
      ledgerBalance: 100,
      currentLedgerBalance: 100,
      originalVariance: variance,
      currentVariance: variance,
      currency: 'VND',
      checkedAt: at,
      createdAt: at,
      updatedAt: at,
    );

void main() {
  final archivedAt = DateTime(2026, 11);
  final summary = WalletCheckpointSummaryResponse(
    wallets: [
      const Wallet(id: 'b', name: 'bank'),
      const Wallet(id: 'a', name: 'Cash'),
      const Wallet(id: 'c', name: 'Card'),
      const Wallet(id: 'd', name: 'Drawer'),
      Wallet(id: 'z', name: 'Old', archivedAt: archivedAt),
    ],
    latestCheckpoints: [
      _checkpoint('a', 0, DateTime(2026, 11, 10)),
      _checkpoint('b', -50, DateTime(2026, 11, 12)),
      _checkpoint('c', 200, DateTime(2026, 10)),
      _checkpoint('z', -9, DateTime(2026, 9)),
    ],
    totalsByCurrency: const [],
  );

  List<String> ids(
    CheckpointWalletFilter filter,
    CheckpointWalletSort sort, {
    Map<String, DateTime?> archived = const {},
  }) => visibleCheckpointWallets(
    checkpointWalletEntries(summary, archived: archived),
    filter: filter,
    sort: sort,
  ).map((entry) => entry.wallet.id).toList();

  test('filters split active wallets by state and keep archived apart', () {
    const name = CheckpointWalletSort.name;
    expect(ids(CheckpointWalletFilter.all, name), ['b', 'c', 'a', 'd']);
    expect(ids(CheckpointWalletFilter.mismatched, name), ['b', 'c']);
    expect(ids(CheckpointWalletFilter.unchecked, name), ['d']);
    expect(ids(CheckpointWalletFilter.archived, name), ['z']);
  });

  test('sorts by variance size or by the stalest check', () {
    expect(ids(CheckpointWalletFilter.all, CheckpointWalletSort.variance), [
      'c',
      'b',
      'a',
      'd',
    ]);
    expect(ids(CheckpointWalletFilter.all, CheckpointWalletSort.lastChecked), [
      'd',
      'c',
      'a',
      'b',
    ]);
  });

  test('local archive changes override the summary until it catches up', () {
    final archived = {'a': DateTime(2026, 11, 20), 'z': null};
    expect(
      ids(
        CheckpointWalletFilter.archived,
        CheckpointWalletSort.name,
        archived: archived,
      ),
      ['a'],
    );
    expect(
      ids(
        CheckpointWalletFilter.unchecked,
        CheckpointWalletSort.name,
        archived: archived,
      ),
      ['d'],
    );
    expect(
      ids(
        CheckpointWalletFilter.mismatched,
        CheckpointWalletSort.name,
        archived: archived,
      ),
      ['b', 'c', 'z'],
    );
  });

  test('wallet JSON carries the archive timestamp', () {
    final wallet = Wallet.fromJson(const {
      'id': 'w',
      'archived_at': '2026-11-20T03:00:00.000Z',
    });
    expect(wallet.isArchived, isTrue);
    expect(Wallet.fromJson(wallet.toJson()), wallet);
    expect(wallet.withArchivedAt(null).isArchived, isFalse);
  });
}
