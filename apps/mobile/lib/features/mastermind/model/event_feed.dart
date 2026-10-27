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

/// What a client does with one feed page, given the cursor it holds.
sealed class EventFeedStep {
  const EventFeedStep();
}

/// Contiguous events to apply; [cursor] is the sequence to request next.
final class EventFeedAppend extends EventFeedStep {
  EventFeedAppend(List<SnapshotEvent> events, this.cursor)
    : events = List.unmodifiable(events);
  final List<SnapshotEvent> events;
  final int cursor;
}

/// The retained history no longer joins the held cursor (feed revision 3
/// rebaseline, retention, or an export older than the cursor). Adopt the fresh
/// snapshot and continue from [cursor]; never apply events from this feed.
final class EventFeedResync extends EventFeedStep {
  const EventFeedResync(this.cursor);
  final int cursor;
}

EventFeedStep reconcileEventFeed({
  required int cursor,
  required MastermindEventFeed feed,
}) {
  if (feed.cursorGap || feed.latestSeq < cursor) {
    return EventFeedResync(feed.latestSeq);
  }
  final fresh = feed.events.where((event) => event.seq > cursor).toList();
  return EventFeedAppend(fresh, fresh.isEmpty ? cursor : fresh.last.seq);
}
