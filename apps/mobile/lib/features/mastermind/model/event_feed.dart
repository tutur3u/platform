import 'package:mobile/features/mastermind/model/snapshot.dart';

final class MastermindEventFeed {
  MastermindEventFeed({
    required this.afterSeq,
    required this.latestSeq,
    required this.cursorGap,
    required List<SnapshotEvent> events,
  }) : events = List.unmodifiable(events);

  final int afterSeq;
  final int latestSeq;
  final bool cursorGap;
  final List<SnapshotEvent> events;
}
