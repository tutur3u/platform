import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

import '../../../helpers/hub_http_source_support.dart';
import '../../../helpers/mastermind_hub_harness.dart';

void main() {
  group('GET /v1/events', () {
    EventsFetchUnavailable unavailable(EventsFetch fetch) =>
        fetch as EventsFetchUnavailable;

    test('pins the digest and sends the cursor and limit', () async {
      final hub = FakeHub(
        (_) => hubReply(
          200,
          body: utf8.encode(jsonEncode(hubEmptyFeed)),
          headers: {'x-hub-digest': hubDigest},
        ),
      );
      final fetch = await hubSource(
        hub,
        FakeTokens(),
      ).fetchEvents(digest: hubDigest, afterSeq: 5, limit: 50);
      final ok = fetch as EventsFetchOk;
      expect(ok.digest, hubDigest);
      expect(ok.feed.afterSeq, 5);
      expect(hub.requests.single.url.path, '/v1/events');
      expect(hub.requests.single.url.queryParameters, {
        'digest': hubDigest,
        'after_seq': '5',
        'limit': '50',
      });
    });

    test('409 cursor_ahead resyncs from a fresh snapshot', () async {
      final hub = FakeHub((_) => hubError(409, 'cursor_ahead'));
      final failure = unavailable(
        await hubSource(
          hub,
          FakeTokens(),
        ).fetchEvents(digest: hubDigest, afterSeq: 99),
      );
      expect(failure.kind, SnapshotUnavailableKind.cursorAhead);
      expect(failure.needsResync, isTrue);
    });

    test('another 409 is not a resync', () async {
      final hub = FakeHub((_) => hubError(409, 'idempotency_conflict'));
      final failure = unavailable(
        await hubSource(
          hub,
          FakeTokens(),
        ).fetchEvents(digest: hubDigest, afterSeq: 1),
      );
      expect(failure.kind, SnapshotUnavailableKind.unavailable);
      expect(failure.needsResync, isFalse);
    });

    test('404 for the pinned export is digestNotFound', () async {
      final hub = FakeHub((_) => hubError(404, 'no_export'));
      expect(
        unavailable(
          await hubSource(
            hub,
            FakeTokens(),
          ).fetchEvents(digest: hubDigest, afterSeq: 1),
        ).kind,
        SnapshotUnavailableKind.digestNotFound,
      );
    });

    test('401, 403 and 5xx map like the snapshot route', () async {
      final expected = {
        401: SnapshotUnavailableKind.unauthorized,
        403: SnapshotUnavailableKind.forbidden,
        500: SnapshotUnavailableKind.unavailable,
      };
      for (final entry in expected.entries) {
        final hub = FakeHub((_) => hubError(entry.key, 'x'));
        expect(
          unavailable(
            await hubSource(
              hub,
              FakeTokens(),
            ).fetchEvents(digest: hubDigest, afterSeq: 1),
          ).kind,
          entry.value,
        );
      }
    });

    test('a feed for another digest or schema is refused', () async {
      final other = FakeHub(
        (_) => hubReply(
          200,
          body: utf8.encode(jsonEncode(hubEmptyFeed)),
          headers: {'x-hub-digest': otherDigest},
        ),
      );
      expect(
        unavailable(
          await hubSource(
            other,
            FakeTokens(),
          ).fetchEvents(digest: hubDigest, afterSeq: 1),
        ).kind,
        SnapshotUnavailableKind.unavailable,
      );
      final old = FakeHub(
        (_) => hubReply(
          200,
          body: utf8.encode(
            jsonEncode({...hubEmptyFeed, 'schema_version': '1.3'}),
          ),
        ),
      );
      expect(
        unavailable(
          await hubSource(
            old,
            FakeTokens(),
          ).fetchEvents(digest: hubDigest, afterSeq: 1),
        ).kind,
        SnapshotUnavailableKind.unavailable,
      );
    });

    test(
      'a malformed digest never reaches the wire; bad ranges throw',
      () async {
        final hub = FakeHub((_) => hubError(500, 'x'));
        final source = hubSource(hub, FakeTokens());
        expect(
          unavailable(await source.fetchEvents(digest: 'zz', afterSeq: 0)).kind,
          SnapshotUnavailableKind.digestNotFound,
        );
        expect(hub.requests, isEmpty);
        expect(
          () => source.fetchEvents(digest: hubDigest, afterSeq: -1),
          throwsRangeError,
        );
        expect(
          () => source.fetchEvents(digest: hubDigest, afterSeq: 0, limit: 201),
          throwsRangeError,
        );
      },
    );
  });

  group('GET /v1/capabilities', () {
    Uint8List body(Object json) =>
        Uint8List.fromList(utf8.encode(jsonEncode(json)));

    test('parses schema_versions, replies and push', () async {
      final hub = FakeHub(
        (_) => hubReply(
          200,
          body: body({
            'schema_versions': ['1.4'],
            'replies': true,
            'push': false,
          }),
        ),
      );
      final fetch = await hubSource(hub, FakeTokens()).fetchCapabilities();
      final capabilities = (fetch as CapabilitiesFetchOk).capabilities;
      expect(capabilities.schemaVersions, ['1.4']);
      expect(capabilities.replies, isTrue);
      expect(capabilities.push, isFalse);
      expect(capabilities.supportsSchema14, isTrue);
      expect(hub.requests.single.url.path, '/v1/capabilities');
    });

    test('a Worker that does not list 1.4 is not a 1.4 Worker', () async {
      final hub = FakeHub(
        (_) => hubReply(
          200,
          body: body({
            'schema_versions': ['1.3'],
            'replies': false,
            'push': false,
          }),
        ),
      );
      final fetch = await hubSource(hub, FakeTokens()).fetchCapabilities();
      expect(
        (fetch as CapabilitiesFetchOk).capabilities.supportsSchema14,
        isFalse,
      );
    });

    test('drifting or malformed bodies fail closed', () async {
      for (final json in <Object>[
        {
          'schema_versions': ['1.4'],
          'replies': true,
        },
        {
          'schema_versions': ['1.4'],
          'replies': true,
          'push': false,
          'x': 1,
        },
        {'schema_versions': '1.4', 'replies': true, 'push': false},
        {
          'schema_versions': [1.4],
          'replies': true,
          'push': false,
        },
        {
          'schema_versions': ['1.4'],
          'replies': 'yes',
          'push': false,
        },
        [],
      ]) {
        final hub = FakeHub((_) => hubReply(200, body: body(json)));
        expect(
          await hubSource(hub, FakeTokens()).fetchCapabilities(),
          isA<CapabilitiesFetchUnavailable>(),
          reason: '$json',
        );
      }
    });

    test(
      '401/403 are access lost; a missing route is just unavailable',
      () async {
        Future<SnapshotUnavailableKind> kind(int status) async {
          final hub = FakeHub((_) => hubError(status, 'x'));
          final fetch = await hubSource(hub, FakeTokens()).fetchCapabilities();
          return (fetch as CapabilitiesFetchUnavailable).kind;
        }

        expect(await kind(403), SnapshotUnavailableKind.forbidden);
        expect(await kind(401), SnapshotUnavailableKind.unauthorized);
        expect(await kind(404), SnapshotUnavailableKind.unavailable);
      },
    );
  });
}
