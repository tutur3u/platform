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

/// Appends only a page that joins [cursor] with no gap: the first event is
/// `cursor + 1`, every event follows its predecessor, and the next cursor is
/// the feed's `after_seq`. An empty page is a no-op only when it holds the
/// cursor. Anything else resyncs from a fresh snapshot.
EventFeedStep reconcileEventFeed({
  required int cursor,
  required MastermindEventFeed feed,
}) {
  final resync = EventFeedResync(feed.latestSeq);
  if (feed.cursorGap || feed.latestSeq < cursor) return resync;
  final events = feed.events;
  if (events.isEmpty) {
    return feed.afterSeq == cursor ? EventFeedAppend(const [], cursor) : resync;
  }
  var expected = cursor + 1;
  for (final event in events) {
    if (event.seq != expected++) return resync;
  }
  if (feed.afterSeq != events.last.seq) return resync;
  return EventFeedAppend(events, feed.afterSeq);
}
