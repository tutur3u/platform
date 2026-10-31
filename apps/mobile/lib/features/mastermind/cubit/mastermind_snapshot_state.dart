import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

sealed class SnapshotRefreshFailure {
  const SnapshotRefreshFailure();
}

final class RejectedRefresh extends SnapshotRefreshFailure {
  const RejectedRefresh(this.reason);
  final RejectionReason reason;
}

final class UnavailableRefresh extends SnapshotRefreshFailure {
  const UnavailableRefresh(this.kind);
  final SnapshotUnavailableKind kind;
}

sealed class MastermindSnapshotState {
  const MastermindSnapshotState();
}

final class MastermindSnapshotInitial extends MastermindSnapshotState {
  const MastermindSnapshotInitial();
}

final class MastermindSnapshotLoading extends MastermindSnapshotState {
  const MastermindSnapshotLoading({this.previous});
  final MastermindSnapshotReady? previous;
}

final class MastermindSnapshotReady extends MastermindSnapshotState {
  const MastermindSnapshotReady({
    required this.snapshot,
    required this.digest,
    required this.origin,
    required this.receivedAt,
    this.refreshFailure,
  });
  final MastermindSnapshot snapshot;
  final String digest;
  final SnapshotOrigin origin;
  final DateTime receivedAt;
  final SnapshotRefreshFailure? refreshFailure;

  MastermindSnapshotReady withFailure(SnapshotRefreshFailure failure) =>
      MastermindSnapshotReady(
        snapshot: snapshot,
        digest: digest,
        origin: origin,
        receivedAt: receivedAt,
        refreshFailure: failure,
      );
}

final class MastermindSnapshotNotConfigured extends MastermindSnapshotState {
  const MastermindSnapshotNotConfigured();
}

/// No snapshot and the source said why: access lost ([SnapshotUnavailableKind
/// .unauthorized]/[SnapshotUnavailableKind.forbidden]), nothing published yet,
/// or the network/Worker is down. A refresh failure with data on hand is
/// [UnavailableRefresh] on [MastermindSnapshotReady] instead.
final class MastermindSnapshotUnavailable extends MastermindSnapshotState {
  const MastermindSnapshotUnavailable(this.kind);
  final SnapshotUnavailableKind kind;
}

final class MastermindSnapshotRejected extends MastermindSnapshotState {
  const MastermindSnapshotRejected(this.reason, {this.previous});
  final RejectionReason reason;
  final MastermindSnapshotReady? previous;
}
