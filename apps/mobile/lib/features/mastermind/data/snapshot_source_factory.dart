import 'package:mobile/features/mastermind/data/fixture_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/unconfigured_snapshot_source.dart';

/// No gateway exists in this phase; all other builds remain disconnected.
MastermindSnapshotSource createMastermindSnapshotSource() {
  final fixture = FixtureSnapshotSource();
  return fixture.isConfigured ? fixture : const UnconfiguredSnapshotSource();
}
