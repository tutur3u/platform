import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

final class UnconfiguredSnapshotSource implements MastermindSnapshotSource {
  const UnconfiguredSnapshotSource();
  @override
  bool get isConfigured => false;
  @override
  Future<SnapshotFetch> fetchSnapshot({String? ifNoneMatch}) async =>
      const SnapshotFetch.unavailable(SnapshotUnavailableKind.notConfigured);
  @override
  Future<EventsFetch> fetchEvents({
    required String digest,
    required int afterSeq,
    int limit = 100,
  }) async {
    RangeError.checkNotNegative(afterSeq, 'afterSeq');
    RangeError.checkValueInInterval(limit, 1, 200, 'limit');
    return const EventsFetch.unavailable(SnapshotUnavailableKind.notConfigured);
  }
}
