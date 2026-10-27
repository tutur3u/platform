import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_state.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/presentation/snapshot_age.dart';

enum MastermindFreshnessKind {
  /// Published within the last few minutes.
  updated,

  /// Older, informational only: publishing is manual at first.
  lastPublished,

  /// The refresh failed to reach the hub; showing what is held.
  offline,

  /// The hub speaks a schema this build does not read.
  updateApp,

  /// The hub answered with something unreadable.
  unreadable,
}

/// The single line shown at the top of every Mastermind tab.
final class MastermindFreshness {
  const MastermindFreshness({
    required this.kind,
    required this.time,
    required this.age,
    this.degradedSources = 0,
  });

  factory MastermindFreshness.of(
    MastermindSnapshotReady ready, {
    Clock? clock,
  }) {
    final snapshot = ready.snapshot;
    final age = (clock ?? DateTime.now)().toUtc().difference(
      snapshot.generatedAt.toUtc(),
    );
    final kind = switch (ready.refreshFailure) {
      UnavailableRefresh() => MastermindFreshnessKind.offline,
      RejectedRefresh(reason: RejectionReason.unsupportedVersion) =>
        MastermindFreshnessKind.updateApp,
      RejectedRefresh() => MastermindFreshnessKind.unreadable,
      null =>
        SnapshotAge.from(snapshot.generatedAt, clock: clock) ==
                SnapshotAge.fresh
            ? MastermindFreshnessKind.updated
            : MastermindFreshnessKind.lastPublished,
    };
    return MastermindFreshness(
      kind: kind,
      time: snapshot.generatedAt,
      age: age,
      degradedSources: snapshot.sources
          .where((source) => source.state != SourceState.ok)
          .length,
    );
  }

  final MastermindFreshnessKind kind;

  /// `generated_at` of the snapshot on screen.
  final DateTime time;
  final Duration age;
  final int degradedSources;

  bool get isWarning =>
      kind == MastermindFreshnessKind.offline ||
      kind == MastermindFreshnessKind.updateApp ||
      kind == MastermindFreshnessKind.unreadable ||
      degradedSources > 0;
}
