import 'package:mobile/features/mastermind/model/snapshot.dart';

/// Where the running, waiting and idle counts came from.
enum ActivitySource {
  /// The hub's own `work.counts`, which equal its per-lane statuses.
  hub,

  /// The latest `observability.fleet.series` point, recent enough to trust.
  fleet,

  /// Tallied from `lanes[].state`, the least precise reading.
  lanes,
}

/// True activity counts, derived once per snapshot so no widget tallies lanes
/// itself. Home reads it now; the lane list header and a future Threads badge
/// read the same model so they cannot disagree.
///
/// Running means a turn is in flight; waiting means blocked on someone or
/// something else; idle means alive with nothing pending. Queued and failed
/// always come from lane states. Lanes with no reliable reading are counted
/// as "not reporting" and never shown as a headline number.
final class MastermindActivity {
  const MastermindActivity({
    required this.running,
    required this.waiting,
    required this.idle,
    required this.queued,
    required this.failed,
    required this.notReporting,
    required this.waitingOnYou,
    required this.source,
  });

  factory MastermindActivity.from(MastermindSnapshot snapshot) {
    final lanes = snapshot.lanes.whereType<Lane>().toList(growable: false);
    int tally(Set<LaneState> states) =>
        lanes.where((lane) => states.contains(lane.state)).length;
    final silentLanes = tally(const {LaneState.unknown, LaneState.stale});
    final waitingOnYou = snapshot.now.needsYou
        .whereType<NeedsYou>()
        .where(
          (item) => item.state == ItemState.open && item.kind != ItemKind.fyi,
        )
        .length;
    MastermindActivity counts(
      ActivitySource source, {
      required int running,
      required int waiting,
      required int idle,
      required int notReporting,
      int? queued,
    }) => MastermindActivity(
      running: running,
      waiting: waiting,
      idle: idle,
      queued: queued ?? tally(const {LaneState.queued}),
      failed: tally(const {LaneState.failed}),
      notReporting: notReporting,
      waitingOnYou: waitingOnYou,
      source: source,
    );

    if (snapshot.workCounts case final hub?) {
      return counts(
        ActivitySource.hub,
        running: hub[LaneState.running] ?? 0,
        waiting: hub[LaneState.waiting] ?? 0,
        idle: hub[LaneState.idle] ?? 0,
        queued: hub[LaneState.queued],
        notReporting: silentLanes,
      );
    }
    if (_recentFleetPoint(snapshot) case final point?) {
      return counts(
        ActivitySource.fleet,
        running: point.running,
        waiting: point.waiting,
        idle: point.idle,
        notReporting: point.unknown,
      );
    }
    return counts(
      ActivitySource.lanes,
      running: tally(const {LaneState.running}),
      waiting: tally(const {LaneState.waiting}),
      idle: tally(const {LaneState.idle}),
      notReporting: silentLanes,
    );
  }

  /// A fleet point older than this is not "now" any more.
  static const fleetMaxAge = Duration(minutes: 15);

  final int running;
  final int waiting;
  final int idle;
  final int queued;
  final int failed;

  /// Unknown or stale lanes: a footnote, never a headline number.
  final int notReporting;

  /// Open Needs-you items that are decisions or actions (FYI excluded), shown
  /// apart from [waiting]: the user is one of the things a lane can wait on.
  final int waitingOnYou;
  final ActivitySource source;

  int count(LaneState state) => switch (state) {
    LaneState.running => running,
    LaneState.waiting => waiting,
    LaneState.idle => idle,
    LaneState.queued => queued,
    LaneState.failed => failed,
    _ => 0,
  };
}

FleetPoint? _recentFleetPoint(MastermindSnapshot snapshot) {
  final fleet = snapshot.observability.fleet;
  if (fleet.coverage != Coverage.ok && fleet.coverage != Coverage.partial) {
    return null;
  }
  FleetPoint? latest;
  for (final point in fleet.series) {
    if (latest == null || point.t.isAfter(latest.t)) latest = point;
  }
  if (latest == null) return null;
  final age = snapshot.generatedAt.difference(latest.t);
  return age > MastermindActivity.fleetMaxAge ? null : latest;
}
