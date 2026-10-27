import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';
import 'package:mobile/features/mastermind/model/event_feed.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/event_feed_parser.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import '../../../helpers/mastermind_snapshot_builder.dart';

typedef Json = Map<String, dynamic>;

Json _feed({
  int afterSeq = 0,
  int latestSeq = 1,
  bool cursorGap = false,
  List<Json>? events,
}) {
  final now = MastermindSnapshotBuilder.defaults().toJson()['now'] as Json;
  return {
    'schema_version': '1.4',
    'after_seq': afterSeq,
    'latest_seq': latestSeq,
    'cursor_gap': cursorGap,
    'events': events ?? (now['digest'] as List<dynamic>).cast<Json>(),
  };
}

EventFeedParseOutcome _parse(Json feed) =>
    parseMastermindEventFeed(Uint8List.fromList(utf8.encode(jsonEncode(feed))));

Json _event(Json feed, [int index = 0]) =>
    (feed['events'] as List<dynamic>)[index] as Json;

void _expectViolation(Json feed, [String? path]) {
  final result = _parse(feed);
  expect(result, isA<EventFeedParseRejected>());
  expect(
    (result as EventFeedParseRejected).reason,
    RejectionReason.schemaViolation,
  );
  if (path != null) expect(result.path, path);
}

MastermindEventFeed _accepted(Json feed) =>
    (_parse(feed) as EventFeedParseAccepted).feed;

class _Source implements MastermindSnapshotSource {
  final fetches = <String?>[];
  Future<SnapshotFetch> Function()? next;
  @override
  bool get isConfigured => true;
  @override
  Future<EventsFetch> fetchEvents({
    required String digest,
    required int afterSeq,
    int limit = 100,
  }) async =>
      const EventsFetch.unavailable(SnapshotUnavailableKind.unavailable);
  @override
  Future<SnapshotFetch> fetchSnapshot({String? ifNoneMatch}) {
    fetches.add(ifNoneMatch);
    return next!();
  }
}

void main() {
  group('7. events feed revision 3', () {
    test('the first 1.4 feed carries cursor_gap with no retained events', () {
      final feed = _accepted(
        _feed(afterSeq: 41, latestSeq: 41, cursorGap: true, events: []),
      );
      expect(feed.cursorGap, isTrue);
      expect(feed.events, isEmpty);
      expect(feed.latestSeq, 41);
    });

    test('rejects 1.3 and unknown versions as unsupported', () {
      for (final version in ['1.3', '1.5']) {
        final result = _parse(_feed()..['schema_version'] = version);
        expect(
          (result as EventFeedParseRejected).reason,
          RejectionReason.unsupportedVersion,
        );
      }
    });

    test('is strict about keys and sequence ordering', () {
      _expectViolation(_feed()..['unexpected'] = true);
      _expectViolation(_feed()..remove('cursor_gap'));
      _expectViolation(_feed(afterSeq: 5, latestSeq: 4, events: []));
      _expectViolation(_feed(afterSeq: 1, latestSeq: 3), '/events/0/seq');
      _expectViolation(_feed(latestSeq: 0), '/events/0/seq');
    });

    group('payload kinds', () {
      for (final kind in ['decision', 'action', 'fyi']) {
        test('needs_you and decision payloads accept kind $kind', () {
          for (final eventKind in ['needs_you', 'decision']) {
            final feed = _feed();
            _event(feed)['kind'] = eventKind;
            (_event(feed)['payload'] as Json)['kind'] = kind;
            final payload = _accepted(feed).events.single.payload as NeedsYou;
            expect(payload.kind!.wireName, kind);
          }
        });
      }
      test('payload kind security is rejected', () {
        final feed = _feed();
        (_event(feed)['payload'] as Json)['kind'] = 'security';
        _expectViolation(feed, '/events/0/payload/kind');
      });
      test('payload severity is rejected', () {
        final feed = _feed();
        (_event(feed)['payload'] as Json)['severity'] = 'low';
        _expectViolation(feed);
      });
      for (final kind in ['needs_you', 'decision', 'lane', 'backlog']) {
        test('$kind events never carry a security row', () {
          final feed = _feed();
          _event(feed)['kind'] = kind;
          _event(feed)['payload'] = {
            'title': 'Security issue',
            'state': 'open',
          };
          _expectViolation(feed, '/events/0/payload');
        });
      }
      test('a quota event keeps its pool label', () {
        final feed = _feed();
        _event(feed)['kind'] = 'quota';
        _event(feed)['payload'] = {
          'instance': 'Codex pool B',
          'remaining_percent': 40,
          'age_seconds': 3,
        };
        final payload = _accepted(feed).events.single.payload as ProductQuota;
        expect(payload.instance, 'Codex pool B');
      });
      test('a quota event rejects an account handle', () {
        final feed = _feed();
        _event(feed)['kind'] = 'quota';
        _event(feed)['payload'] = {
          'instance': 'codex_ai4ed',
          'remaining_percent': 40,
          'age_seconds': 3,
        };
        _expectViolation(feed);
      });
    });

    group('cursor reconciliation', () {
      SnapshotEvent at(int seq) {
        final b = MastermindSnapshotBuilder.defaults().toJson();
        final root = _feed(afterSeq: seq - 1, latestSeq: seq);
        _event(root)['seq'] = seq;
        _event(root)['ts'] = b['generated_at'];
        return _accepted(root).events.single;
      }

      test('a gap resets the cursor to latest_seq and applies no events', () {
        final feed = MastermindEventFeed(
          afterSeq: 41,
          latestSeq: 41,
          cursorGap: true,
          events: const [],
        );
        final step = reconcileEventFeed(cursor: 7, feed: feed);
        expect(step, isA<EventFeedResync>());
        expect((step as EventFeedResync).cursor, 41);
      });
      test('a gap never applies events carried alongside it', () {
        final feed = MastermindEventFeed(
          afterSeq: 7,
          latestSeq: 9,
          cursorGap: true,
          events: [at(8), at(9)],
        );
        expect(
          reconcileEventFeed(cursor: 7, feed: feed),
          isA<EventFeedResync>(),
        );
      });
      test('a feed behind the cursor is a resync', () {
        final feed = MastermindEventFeed(
          afterSeq: 0,
          latestSeq: 3,
          cursorGap: false,
          events: const [],
        );
        final step = reconcileEventFeed(cursor: 7, feed: feed);
        expect((step as EventFeedResync).cursor, 3);
      });
      test('contiguous events append and advance the cursor', () {
        final feed = MastermindEventFeed(
          afterSeq: 7,
          latestSeq: 9,
          cursorGap: false,
          events: [at(8), at(9)],
        );
        final step = reconcileEventFeed(cursor: 7, feed: feed);
        expect(step, isA<EventFeedAppend>());
        expect((step as EventFeedAppend).cursor, 9);
        expect(step.events.map((e) => e.seq), [8, 9]);
        expect(step.events.clear, throwsUnsupportedError);
      });
      test('an empty contiguous feed keeps the cursor', () {
        final feed = MastermindEventFeed(
          afterSeq: 7,
          latestSeq: 7,
          cursorGap: false,
          events: const [],
        );
        final step = reconcileEventFeed(cursor: 7, feed: feed);
        expect((step as EventFeedAppend).cursor, 7);
      });
    });

    group('cubit adopts the fresh snapshot on a gap', () {
      const first = 'a';
      const fresh = 'b';
      String digest(String c) => c * 64;

      Future<(MastermindSnapshotCubit, _Source)> loaded() async {
        final source = _Source();
        final cubit = MastermindSnapshotCubit(
          source: source,
          store: MemorySnapshotStore(),
          clock: () => DateTime.utc(2026),
          parser: (bytes) async => parseMastermindSnapshot(bytes),
        );
        source.next = () async => SnapshotFetch.ok(
          MastermindSnapshotBuilder.defaults().bytes(),
          DateTime.utc(2026),
          digest: digest(first),
        );
        await cubit.refresh();
        return (cubit, source);
      }

      test('a gap refetches without reusing the old export', () async {
        final (cubit, source) = await loaded();
        final b = MastermindSnapshotBuilder.defaults()..cursorGap = false;
        final json = b.toJson();
        (json['now'] as Json)
          ..['after_seq'] = 41
          ..['latest_seq'] = 41
          ..['digest'] = <dynamic>[];
        source.next = () async => SnapshotFetch.ok(
          Uint8List.fromList(utf8.encode(jsonEncode(json))),
          DateTime.utc(2026),
          digest: digest(fresh),
        );
        final step = await cubit.applyEventFeed(
          MastermindEventFeed(
            afterSeq: 41,
            latestSeq: 41,
            cursorGap: true,
            events: const [],
          ),
        );
        expect(step, isA<EventFeedResync>());
        final state = cubit.state as MastermindSnapshotReady;
        expect(state.digest, digest(fresh));
        expect(state.snapshot.now.latestSeq, 41);
        expect(source.fetches.last, '"${digest(first)}"');
        await cubit.close();
      });

      test('contiguous events do not refetch', () async {
        final (cubit, source) = await loaded();
        final before = source.fetches.length;
        final step = await cubit.applyEventFeed(
          MastermindEventFeed(
            afterSeq: 1,
            latestSeq: 1,
            cursorGap: false,
            events: const [],
          ),
        );
        expect(step, isA<EventFeedAppend>());
        expect(source.fetches.length, before);
        await cubit.close();
      });
    });
  });
}
