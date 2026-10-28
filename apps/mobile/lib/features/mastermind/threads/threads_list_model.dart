import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';

/// The status groups the Threads list filters by, in chip order. Queued lanes
/// count as running; states the hub does not group fall under idle.
const List<LaneState> threadStatuses = [
  LaneState.running,
  LaneState.waiting,
  LaneState.idle,
  LaneState.failed,
];

LaneState threadStatusOf(LaneState state) => switch (state) {
  LaneState.running || LaneState.queued => LaneState.running,
  LaneState.waiting => LaneState.waiting,
  LaneState.failed => LaneState.failed,
  _ => LaneState.idle,
};

/// A `?state=` value as a status group, so a Work or Home link still filters.
LaneState? threadStatusFromQuery(String? value) =>
    switch (laneStateFromQuery(value)) {
      final state? => threadStatusOf(state),
      null => null,
    };

/// The Threads location for a segment and status selection.
String threadsLocation({
  WorkSegment segment = WorkSegment.lanes,
  LaneState? status,
}) {
  final query = {
    if (segment != WorkSegment.lanes) 'segment': segment.queryValue,
    'state': ?status?.wireName,
  };
  return Uri(
    path: '/mastermind/threads',
    queryParameters: query.isEmpty ? null : query,
  ).toString();
}

/// P1a Threads list, derived from one accepted snapshot. It reads the same
/// parsed lanes and `work.counts` as Work and Home and never parses the hub
/// payload itself. A lane id is a snapshot id, never a history reference.
final class ThreadsListModel {
  const ThreadsListModel._({
    required this.lanes,
    required this.counts,
    required this.security,
    required this.total,
  });

  factory ThreadsListModel.from(
    MastermindSnapshot snapshot, {
    String query = '',
    LaneState? status,
  }) {
    final all = snapshot.lanes.whereType<Lane>().toList(growable: false);
    final derived = {for (final s in threadStatuses) s: 0};
    for (final lane in all) {
      final group = threadStatusOf(lane.state);
      derived[group] = derived[group]! + 1;
    }
    final needle = query.trim().toLowerCase();
    return ThreadsListModel._(
      total: all.length,
      lanes: [
        for (final lane in all)
          if ((status == null || threadStatusOf(lane.state) == status) &&
              (needle.isEmpty ||
                  '${lane.title} ${lane.role}'.toLowerCase().contains(needle)))
            lane,
      ],
      // Published counts cover running, waiting and idle; failed is derived.
      counts: {...derived, ...?snapshot.workCounts},
      security: snapshot.lanes.whereType<SecurityItem>().toList(
        growable: false,
      ),
    );
  }

  final List<Lane> lanes;
  final Map<LaneState, int> counts;
  final List<SecurityItem> security;
  final int total;

  /// Chips to offer: the published groups always, failed only when present
  /// or selected so a deep-linked filter can be cleared.
  List<LaneState> statuses(LaneState? selected) => [
    for (final s in threadStatuses)
      if (s != LaneState.failed || (counts[s] ?? 0) > 0 || s == selected) s,
  ];
}
