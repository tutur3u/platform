import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/features/mastermind/model/event_feed.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/parse/strict_json.dart';

sealed class EventFeedParseOutcome {
  const EventFeedParseOutcome();
  const factory EventFeedParseOutcome.accepted(MastermindEventFeed feed) =
      EventFeedParseAccepted;
  const factory EventFeedParseOutcome.rejected(
    RejectionReason reason, [
    String path,
  ]) = EventFeedParseRejected;
}

final class EventFeedParseAccepted extends EventFeedParseOutcome {
  const EventFeedParseAccepted(this.feed);
  final MastermindEventFeed feed;
}

final class EventFeedParseRejected extends EventFeedParseOutcome {
  const EventFeedParseRejected(this.reason, [this.path = '']);
  final RejectionReason reason;

  /// Debug/test pointer only; never surface or log it in release builds.
  final String path;
}

/// Parses a schema 1.4 `GET /v1/events` body. `after_seq` is the cursor after
/// the page (the Worker advances it to the last returned event). Payload kinds
/// follow the events schema: `needs_you` and `decision` carry
/// `decision|action|fyi` items and no payload is ever a security row.
EventFeedParseOutcome parseMastermindEventFeed(Uint8List bytes) {
  if (bytes.length > 600000) {
    return const EventFeedParseOutcome.rejected(RejectionReason.tooLarge);
  }
  final Object? decoded;
  try {
    decoded = jsonDecode(utf8.decode(bytes));
  } on FormatException {
    return const EventFeedParseOutcome.rejected(RejectionReason.malformedJson);
  }
  try {
    final r = JsonReader(decoded);
    final root = r.object();
    if (root.containsKey('schema_version') && root['schema_version'] != '1.4') {
      return const EventFeedParseOutcome.rejected(
        RejectionReason.unsupportedVersion,
      );
    }
    const keys = [
      'schema_version',
      'after_seq',
      'latest_seq',
      'cursor_gap',
      'events',
    ];
    r.keys(keys, keys);
    r.field('schema_version').string(constant: '1.4');
    final afterSeq = r.field('after_seq').integer(min: 0);
    final latestSeq = r.field('latest_seq').integer(min: 0);
    if (latestSeq < afterSeq) r.field('latest_seq').fail();
    final events = r.field('events').list(parseSnapshotEvent, maxItems: 200);
    // `after_seq` is the cursor AFTER this page, not the one the client sent:
    // events ascend strictly and the last one lands exactly on it.
    var previous = 0;
    for (var i = 0; i < events.length; i++) {
      final seq = events[i].seq;
      final isLast = i == events.length - 1;
      if (seq <= previous ||
          seq > afterSeq ||
          seq > latestSeq ||
          (isLast && seq != afterSeq)) {
        JsonReader(null, '${r.path}/events/$i/seq').fail();
      }
      previous = seq;
    }
    return EventFeedParseOutcome.accepted(
      MastermindEventFeed(
        afterSeq: afterSeq,
        latestSeq: latestSeq,
        cursorGap: r.field('cursor_gap').boolean(),
        events: events,
      ),
    );
  } on SchemaViolation catch (error) {
    return EventFeedParseOutcome.rejected(
      RejectionReason.schemaViolation,
      error.path,
    );
  }
}
