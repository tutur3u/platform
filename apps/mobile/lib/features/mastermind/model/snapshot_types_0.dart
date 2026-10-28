part of 'snapshot.dart';

final class MastermindSnapshot {
  MastermindSnapshot({
    required this.schemaVersion,
    required this.generatedAt,
    required this.now,
    required List<LaneItem> lanes,
    required List<BacklogEntry> backlog,
    required this.products,
    required List<EnvironmentRow> environments,
    required List<Decision> decisions,
    required this.decisionsSkipped,
    required this.observability,
    required List<Source> sources,
    this.resolvedItems = const [],
  }) : lanes = List.unmodifiable(lanes),
       backlog = List.unmodifiable(backlog),
       environments = List.unmodifiable(environments),
       decisions = List.unmodifiable(decisions),
       sources = List.unmodifiable(sources);

  final String schemaVersion;
  final List<NeedsYou> resolvedItems;
  final DateTime generatedAt;
  final SnapshotNow now;
  final List<LaneItem> lanes;
  final List<BacklogEntry> backlog;
  final SnapshotProducts products;
  final List<EnvironmentRow> environments;
  final List<Decision> decisions;
  final int decisionsSkipped;
  final Observability observability;
  final List<Source> sources;
}

final class SnapshotNow {
  SnapshotNow({
    required this.afterSeq,
    required this.latestSeq,
    required this.cursorGap,
    required List<SnapshotEvent> digest,
    required List<NeedsYouItem> needsYou,
  }) : digest = List.unmodifiable(digest),
       needsYou = List.unmodifiable(needsYou);

  final int afterSeq;
  final int latestSeq;
  final bool cursorGap;
  final List<SnapshotEvent> digest;
  final List<NeedsYouItem> needsYou;
}

final class SnapshotProducts {
  SnapshotProducts({
    required List<ProductRelease> releases,
    required List<ProductQuota> quotas,
  }) : releases = List.unmodifiable(releases),
       quotas = List.unmodifiable(quotas);

  final List<ProductRelease> releases;
  final List<ProductQuota> quotas;
}
