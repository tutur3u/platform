import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';

/// What Home renders, derived once from one accepted snapshot.
///
/// Security rows never mix with normal items: they have no count, no order and
/// no severity, so they are kept in their own list and are never tallied.
final class MastermindHomeModel {
  const MastermindHomeModel._({
    required this.needsYou,
    required this.security,
    required this.laneCounts,
    required this.failingEnvironments,
    required this.releases,
    required this.quotaPools,
    required this.decisions,
    required this.activity,
  });

  factory MastermindHomeModel.from(MastermindSnapshot snapshot) {
    final needsYou = <NeedsYou>[
      for (final item in snapshot.now.needsYou)
        if (item is NeedsYou) item,
    ];
    final counts = {for (final state in laneStatesAtAGlance) state: 0};
    for (final lane in snapshot.lanes) {
      if (lane is Lane && counts.containsKey(lane.state)) {
        counts[lane.state] = counts[lane.state]! + 1;
      }
    }
    final decisions = [...snapshot.decisions]
      ..sort((a, b) => b.at.compareTo(a.at));
    final activity = [...snapshot.now.digest]
      ..sort((a, b) {
        final byTime = b.ts.compareTo(a.ts);
        return byTime != 0 ? byTime : b.seq.compareTo(a.seq);
      });
    return MastermindHomeModel._(
      needsYou: _orderNeedsYou(needsYou),
      security: _onePerProduct(snapshot.now.needsYou),
      laneCounts: counts,
      failingEnvironments: [
        for (final row in snapshot.environments)
          if (environmentIsFailing(row)) row,
      ],
      releases: snapshot.products.releases,
      quotaPools: _quotaPools(snapshot.observability.usage),
      decisions: decisions.take(decisionLimit).toList(growable: false),
      activity: activity.take(activityLimit).toList(growable: false),
    );
  }

  static const needsYouPreview = 3;
  static const decisionLimit = 3;
  static const activityLimit = 5;
  static const List<LaneState> laneStatesAtAGlance = [
    LaneState.running,
    LaneState.waiting,
    LaneState.queued,
    LaneState.failed,
  ];

  /// Normal items only, decision then action then fyi, then publisher order.
  final List<NeedsYou> needsYou;

  /// At most one per product, never counted.
  final List<SecurityItem> security;
  final Map<LaneState, int> laneCounts;
  final List<EnvironmentRow> failingEnvironments;
  final List<ProductRelease> releases;
  final List<QuotaPool> quotaPools;
  final List<Decision> decisions;
  final List<SnapshotEvent> activity;

  int get needsYouCount => needsYou.length;
  List<NeedsYou> get needsYouShown =>
      needsYou.take(needsYouPreview).toList(growable: false);
}

/// One pool row: its latest reading plus the session series for its sparkline.
final class QuotaPool {
  const QuotaPool({required this.latest, required this.series});

  final UsagePoint latest;
  final List<UsagePoint> series;

  String get label => latest.instance;
}

int _kindRank(ItemKind? kind) => switch (kind) {
  ItemKind.decision => 0,
  ItemKind.action => 1,
  ItemKind.fyi => 2,
  null => 3,
};

// List.sort is not stable, so the publisher index breaks ties explicitly.
List<NeedsYou> _orderNeedsYou(List<NeedsYou> items) {
  final indexed = [for (var i = 0; i < items.length; i++) (i, items[i])]
    ..sort((a, b) {
      final byKind = _kindRank(a.$2.kind).compareTo(_kindRank(b.$2.kind));
      return byKind != 0 ? byKind : a.$1.compareTo(b.$1);
    });
  return [for (final entry in indexed) entry.$2];
}

List<SecurityItem> _onePerProduct(List<NeedsYouItem> items) {
  final seen = <Product?>{};
  return [
    for (final item in items)
      if (item is SecurityItem && seen.add(item.product)) item,
  ];
}

List<QuotaPool> _quotaPools(Usage usage) => [
  for (final latest in usage.instances)
    QuotaPool(
      latest: latest,
      series: [
        for (final point in usage.series)
          if (point.instance == latest.instance) point,
      ],
    ),
];
