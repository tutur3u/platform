part of 'snapshot.dart';

final class Fleet {
  Fleet({
    required this.coverage,
    required List<FleetCount> counts,
    required List<FleetPoint> series,
    required List<FleetTree> tree,
  }) : counts = List.unmodifiable(counts),
       series = List.unmodifiable(series),
       tree = List.unmodifiable(tree);

  final Coverage coverage;
  final List<FleetCount> counts;
  final List<FleetPoint> series;
  final List<FleetTree> tree;
}

final class FleetCount {
  const FleetCount({
    required this.role,
    required this.topLevel,
    required this.depth1,
    required this.depth2Plus,
  });

  final Role role;
  final int topLevel;
  final int depth1;
  final int depth2Plus;
}

final class FleetPoint {
  const FleetPoint({
    required this.t,
    required this.running,
    required this.waiting,
    required this.idle,
    required this.unknown,
  });

  final DateTime t;
  final int running;
  final int waiting;
  final int idle;
  final int unknown;
}
