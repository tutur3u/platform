import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/activity_model.dart';
import 'package:mobile/features/mastermind/presentation/open_asks.dart';
import 'package:mobile/features/mastermind/presentation/security_rows.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';

/// What Home renders, derived once from one accepted snapshot.
///
/// Every list is capped; the full counts are kept so a "Show all N" row can
/// say how many more the owning tab holds.
///
/// Security rows never mix with normal items: they have no count, no order and
/// no severity, so they are kept in their own list and are never tallied.
final class MastermindHomeModel {
  const MastermindHomeModel._({
    required this.needsYou,
    required this.generatedAt,
    required this.security,
    required this.lanes,
    required this.failingEnvironments,
    required this.releases,
    required this.releaseCount,
    required this.quotaPools,
    required this.quotaPoolCount,
    required this.decisions,
    required this.activity,
  });

  factory MastermindHomeModel.from(MastermindSnapshot snapshot) {
    final needsYou = openAsks(snapshot);
    final decisions = [...snapshot.decisions]
      ..sort((a, b) => b.at.compareTo(a.at));
    final activity = singleSecurityEvent(
      [...snapshot.now.digest]..sort((a, b) {
        final byTime = b.ts.compareTo(a.ts);
        return byTime != 0 ? byTime : b.seq.compareTo(a.seq);
      }),
    );
    final pools = MastermindUsageModel.from(snapshot).pools;
    return MastermindHomeModel._(
      needsYou: _orderNeedsYou(needsYou),
      generatedAt: snapshot.generatedAt,
      security: singleSecurityRow(snapshot.now.needsYou),
      lanes: MastermindActivity.from(snapshot),
      failingEnvironments: [
        for (final row in snapshot.environments)
          if (environmentIsFailing(row)) row,
      ],
      releases: _mostRecent(
        snapshot.products.releases,
      ).take(releaseLimit).toList(growable: false),
      releaseCount: snapshot.products.releases.length,
      quotaPools: pools.take(quotaPoolLimit).toList(growable: false),
      quotaPoolCount: pools.length,
      decisions: decisions.take(decisionLimit).toList(growable: false),
      activity: activity.take(activityLimit).toList(growable: false),
    );
  }

  static const needsYouPreview = 3;
  static const releaseLimit = 3;
  static const quotaPoolLimit = 3;
  static const decisionLimit = 3;
  static const activityLimit = 3;

  /// Normal items only, decision then action then fyi, then publisher order.
  final List<NeedsYou> needsYou;
  final DateTime generatedAt;

  /// At most one row for the whole list, never counted.
  final List<SecurityItem> security;

  /// True running, waiting, idle and failed counts plus "waiting on you".
  final MastermindActivity lanes;
  final List<EnvironmentRow> failingEnvironments;

  /// The most recently released products first; a release with no age last.
  final List<ProductRelease> releases;
  final int releaseCount;

  /// The most urgent pools first (the Insights order).
  final List<UsagePool> quotaPools;
  final int quotaPoolCount;
  final List<Decision> decisions;
  final List<SnapshotEvent> activity;

  int get needsYouCount => needsYou.length;
  List<NeedsYou> get needsYouShown =>
      needsYou.take(needsYouPreview).toList(growable: false);

  /// Every row shares one age basis, so it moves into the section caption.
  AgeBasis? get sharedReleaseBasis {
    final bases = {for (final release in releases) release.ageBasis};
    return bases.length == 1 && bases.single != AgeBasis.unknown
        ? bases.single
        : null;
  }
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

// Youngest release first, then publisher order; no age sorts last.
List<ProductRelease> _mostRecent(List<ProductRelease> releases) {
  final indexed = [for (var i = 0; i < releases.length; i++) (i, releases[i])]
    ..sort((a, b) {
      final ageA = a.$2.prodAgeSeconds;
      final ageB = b.$2.prodAgeSeconds;
      if (ageA != ageB) {
        if (ageA == null) return 1;
        if (ageB == null) return -1;
        return ageA.compareTo(ageB);
      }
      return a.$1.compareTo(b.$1);
    });
  return [for (final entry in indexed) entry.$2];
}
