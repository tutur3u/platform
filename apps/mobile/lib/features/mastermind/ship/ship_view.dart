import 'package:mobile/features/mastermind/ship/ship_data.dart';

/// The Ship screen's view of a snapshot, matching Mastermind web
/// (apps/mastermind/src/ship/model.ts): every row is Checked (with its age),
/// Partial (one of its sources failed), Stale (past three collector slots)
/// or Unknown (never confirmed).
enum ShipFreshnessKind { checked, partial, stale, unknown }

typedef ShipFreshness = ({
  ShipFreshnessKind kind,
  DateTime? okAt,
  List<ShipSource> failed,
});

enum ShipPageKind { live, partial, error }

enum ShipFilter { all, waiting, failing, doubtful }

bool _failed(ShipSource source) =>
    source.state == ShipSourceState.error ||
    source.state == ShipSourceState.backoff;

ShipFreshness shipFreshness(
  ShipApp app,
  Map<String, ShipSource> sources,
  DateTime now,
) {
  final own = [
    for (final id in app.sources)
      if (sources[id] case final source?) source,
  ];
  final failed = own.where(_failed).toList();
  final working = own.where((s) => s.state == ShipSourceState.ok).toList();
  List<DateTime> times(Iterable<ShipSource> list) => [
    for (final s in list)
      if (s.okAt case final at?) at,
  ]..sort();
  // Age from working sources only; with none, from the last confirmation.
  final okAt = working.isNotEmpty
      ? times(working).firstOrNull
      : times(own).lastOrNull;
  if (own.isEmpty || okAt == null) {
    return (kind: ShipFreshnessKind.unknown, okAt: null, failed: failed);
  }
  if (now.difference(okAt) > shipStaleAfter) {
    return (kind: ShipFreshnessKind.stale, okAt: okAt, failed: failed);
  }
  return (
    kind: failed.isEmpty
        ? ShipFreshnessKind.checked
        : ShipFreshnessKind.partial,
    okAt: okAt,
    failed: failed,
  );
}

class ShipView {
  ShipView(this.snapshot, this.now, {this.forceStale = false})
    : sources = {for (final s in snapshot.sources) s.id: s};

  final ShipSnapshot snapshot;
  final DateTime now;
  final Map<String, ShipSource> sources;

  /// The latest read failed and the owner chose to see this snapshot anyway:
  /// every confirmed row reads Stale.
  final bool forceStale;

  ShipFreshness freshnessOf(ShipApp app) {
    final fresh = shipFreshness(app, sources, now);
    return forceStale && fresh.kind != ShipFreshnessKind.unknown
        ? (
            kind: ShipFreshnessKind.stale,
            okAt: fresh.okAt,
            failed: fresh.failed,
          )
        : fresh;
  }

  ShipPageKind get page {
    final configured = snapshot.sources.where(
      (s) => s.state != ShipSourceState.unconfigured,
    );
    if (configured.isNotEmpty && configured.every(_failed)) {
      return ShipPageKind.error;
    }
    return configured.any(_failed) ? ShipPageKind.partial : ShipPageKind.live;
  }

  /// The newest confirmation from any source.
  DateTime? get lastGoodCheck {
    final times = [
      for (final s in snapshot.sources)
        if (s.okAt case final at?) at,
    ]..sort();
    return times.isEmpty ? null : times.last;
  }

  int get waiting =>
      snapshot.apps.fold(0, (sum, app) => sum + (app.pending?.commits ?? 0));

  bool matches(ShipApp app, ShipFilter filter) => switch (filter) {
    ShipFilter.all => true,
    ShipFilter.waiting => (app.pending?.commits ?? 0) > 0,
    ShipFilter.failing => app.production.release?.ci == ShipCi.failure,
    ShipFilter.doubtful => switch (freshnessOf(app).kind) {
      ShipFreshnessKind.stale || ShipFreshnessKind.unknown => true,
      _ => false,
    },
  };

  int count(ShipFilter filter) =>
      snapshot.apps.where((app) => matches(app, filter)).length;
}

/// Product groups in display order, as on Mastermind web.
const shipGroups = <(String, List<String>)>[
  ('platform', ['web', 'calendar', 'contacts', 'meet', 'mail', 'mastermind']),
  ('mobile', ['mobile']),
  ('upskii', ['upskii']),
  ('masteryAi', ['mastery-ai']),
  ('pktm', ['pktm']),
];

String shortSha(String sha) => sha.substring(0, 7);
