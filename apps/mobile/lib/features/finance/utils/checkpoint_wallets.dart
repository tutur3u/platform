import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';

/// Which wallets the checkpoint list shows. Every filter but [archived]
/// leaves archived wallets out.
enum CheckpointWalletFilter { all, mismatched, unchecked, archived }

/// Order of the checkpoint list.
enum CheckpointWalletSort { name, variance, lastChecked }

/// Reconciliation state of one wallet's latest checkpoint.
enum CheckpointWalletStatus { unchecked, balanced, mismatched }

/// A wallet with its latest checkpoint, as the checkpoint list shows it.
class CheckpointWalletEntry {
  const CheckpointWalletEntry(this.wallet, this.latest);

  final Wallet wallet;
  final WalletCheckpoint? latest;

  CheckpointWalletStatus get status => switch (latest) {
    null => CheckpointWalletStatus.unchecked,
    final checkpoint when checkpoint.currentVariance == 0 =>
      CheckpointWalletStatus.balanced,
    _ => CheckpointWalletStatus.mismatched,
  };

  bool matches(CheckpointWalletFilter filter) => switch (filter) {
    CheckpointWalletFilter.archived => wallet.isArchived,
    _ when wallet.isArchived => false,
    CheckpointWalletFilter.all => true,
    CheckpointWalletFilter.mismatched =>
      status == CheckpointWalletStatus.mismatched,
    CheckpointWalletFilter.unchecked =>
      status == CheckpointWalletStatus.unchecked,
  };
}

/// Pairs the summary's wallets with their latest checkpoint, applying
/// [archived] overrides that have not reached the server summary yet.
List<CheckpointWalletEntry> checkpointWalletEntries(
  WalletCheckpointSummaryResponse summary, {
  Map<String, DateTime?> archived = const {},
}) {
  final latest = {
    for (final row in summary.latestCheckpoints) row.walletId: row,
  };
  return [
    for (final wallet in summary.wallets)
      CheckpointWalletEntry(
        archived.containsKey(wallet.id)
            ? wallet.withArchivedAt(archived[wallet.id])
            : wallet,
        latest[wallet.id],
      ),
  ];
}

/// [entries] matching [filter], ordered by [sort]. Name ties fall back to
/// the wallet id so the order is stable.
List<CheckpointWalletEntry> visibleCheckpointWallets(
  Iterable<CheckpointWalletEntry> entries, {
  required CheckpointWalletFilter filter,
  required CheckpointWalletSort sort,
}) {
  int byName(CheckpointWalletEntry a, CheckpointWalletEntry b) {
    final name = (a.wallet.name ?? '').toLowerCase().compareTo(
      (b.wallet.name ?? '').toLowerCase(),
    );
    return name != 0 ? name : a.wallet.id.compareTo(b.wallet.id);
  }

  int compare(CheckpointWalletEntry a, CheckpointWalletEntry b) {
    final order = switch (sort) {
      CheckpointWalletSort.name => 0,
      // Largest discrepancy first; unchecked wallets after every checked one.
      CheckpointWalletSort.variance =>
        (b.latest?.currentVariance.abs() ?? -1).compareTo(
          a.latest?.currentVariance.abs() ?? -1,
        ),
      // Least recently checked first; never checked leads.
      CheckpointWalletSort.lastChecked => switch ((a.latest, b.latest)) {
        (null, null) => 0,
        (null, _) => -1,
        (_, null) => 1,
        (final x?, final y?) => x.checkedAt.compareTo(y.checkedAt),
      },
    };
    return order != 0 ? order : byName(a, b);
  }

  return entries.where((entry) => entry.matches(filter)).toList()
    ..sort(compare);
}
