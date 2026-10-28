import 'package:mobile/features/mastermind/model/snapshot.dart';

/// Lane states in the order Work lists them: what needs attention first.
const List<LaneState> laneStatePriority = [
  LaneState.failed,
  LaneState.waiting,
  LaneState.running,
  LaneState.queued,
  LaneState.idle,
  LaneState.stale,
  LaneState.completed,
  LaneState.cancelled,
  LaneState.open,
  LaneState.answered,
  LaneState.withdrawn,
  LaneState.unknown,
];

/// The lane state a `?state=` query names, or null for anything else.
LaneState? laneStateFromQuery(String? value) {
  for (final state in LaneState.values) {
    if (state.wireName == value) return state;
  }
  return null;
}

/// One state's lanes, oldest first.
final class LaneGroup {
  const LaneGroup({required this.state, required this.lanes});

  final LaneState state;
  final List<Lane> lanes;
}

/// What the Work lane list renders, derived from one accepted snapshot.
///
/// Security rows never mix with normal lanes: they have no id, count, order or
/// severity, so they stay in their own list and are never tallied, filtered or
/// searched.
final class MastermindWorkModel {
  const MastermindWorkModel._({
    required this.groups,
    required this.security,
    required this.total,
    required this.stateCounts,
    required this.products,
  });

  factory MastermindWorkModel.from(
    MastermindSnapshot snapshot, {
    String query = '',
    LaneState? state,
    Product? product,
  }) {
    final normal = [
      for (final item in snapshot.lanes)
        if (item is Lane) item,
    ];
    final needle = query.trim().toLowerCase();
    final shown = [
      for (final lane in normal)
        if ((state == null || lane.state == state) &&
            (product == null || lane.product == product) &&
            (needle.isEmpty || _matches(lane, needle)))
          lane,
    ];
    final counts = <LaneState, int>{};
    for (final lane in normal) {
      counts[lane.state] = (counts[lane.state] ?? 0) + 1;
    }
    return MastermindWorkModel._(
      groups: [
        for (final group in laneStatePriority)
          if (_oldestFirst([
                for (final lane in shown)
                  if (lane.state == group) lane,
              ])
              case final lanes when lanes.isNotEmpty)
            LaneGroup(state: group, lanes: lanes),
      ],
      security: _onePerProduct(snapshot.lanes),
      total: normal.length,
      stateCounts: counts,
      products: {
        for (final lane in normal)
          if (lane.product != null) lane.product!,
      }.toList(growable: false),
    );
  }

  final List<LaneGroup> groups;

  /// At most one per product, never counted, filtered or searched.
  final List<SecurityItem> security;

  /// Normal lanes before any filter.
  final int total;

  /// Normal lanes per state before any filter, for the state chips.
  final Map<LaneState, int> stateCounts;

  /// Products present among the normal lanes, for the filter chips.
  final List<Product> products;

  /// States that have lanes, in list order.
  List<LaneState> get presentStates => [
    for (final state in laneStatePriority)
      if ((stateCounts[state] ?? 0) > 0) state,
  ];

  int get shownCount =>
      groups.fold(0, (sum, group) => sum + group.lanes.length);
  bool get isEmpty => total == 0;
  bool get hasNoMatches => total > 0 && shownCount == 0;
}

// The oldest lane first; a lane with no age sorts last. List.sort is not
// stable, so the publisher index breaks ties explicitly.
List<Lane> _oldestFirst(List<Lane> lanes) {
  final indexed = [for (var i = 0; i < lanes.length; i++) (i, lanes[i])]
    ..sort((a, b) {
      final left = a.$2.ageSeconds;
      final right = b.$2.ageSeconds;
      if (left != right) {
        if (left == null) return 1;
        if (right == null) return -1;
        return right.compareTo(left);
      }
      return a.$1.compareTo(b.$1);
    });
  return [for (final entry in indexed) entry.$2];
}

bool _matches(Lane lane, String needle) =>
    lane.title.toLowerCase().contains(needle) ||
    lane.role.toLowerCase().contains(needle) ||
    lane.providerModel.toLowerCase().contains(needle) ||
    (lane.product?.wireName.toLowerCase().contains(needle) ?? false);

List<SecurityItem> _onePerProduct(List<LaneItem> items) {
  final seen = <Product?>{};
  return [
    for (final item in items)
      if (item is SecurityItem && seen.add(item.product)) item,
  ];
}

/// The lane with [id], or null if it is no longer in the snapshot. Security
/// rows have no id and are never found.
Lane? laneById(MastermindSnapshot snapshot, String id) {
  for (final item in snapshot.lanes) {
    if (item is Lane && item.id == id) return item;
  }
  return null;
}
