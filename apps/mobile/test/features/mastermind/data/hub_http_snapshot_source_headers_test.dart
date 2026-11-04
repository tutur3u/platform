import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import '../../../helpers/hub_http_source_support.dart';
import '../../../helpers/mastermind_hub_harness.dart';

http.StreamedResponse _ok(Map<String, String> headers, {int bytes = 2}) =>
    hubReply(200, body: Uint8List(bytes), headers: headers);

void main() {
  group('digest headers survive CDN rewrites', () {
    Future<SnapshotFetch> fetchWith(Map<String, String> headers) =>
        hubSource(FakeHub((_) => _ok(headers)), FakeTokens()).fetchSnapshot();

    test('a weak ETag alone is accepted', () async {
      final fetch = await fetchWith({'etag': 'W/"$hubDigest"'});
      expect((fetch as SnapshotFetchOk).digest, hubDigest);
      expect(fetch.etag, '"$hubDigest"');
    });

    test('a valid X-Hub-Digest without an ETag is accepted', () async {
      final fetch = await fetchWith({'x-hub-digest': hubDigest});
      expect((fetch as SnapshotFetchOk).digest, hubDigest);
    });

    test('a malformed ETag never invalidates a valid X-Hub-Digest', () async {
      for (final etag in [
        'W/"short"',
        'W/"$otherDigest-gzip"',
        '"${hubDigest.toUpperCase()}"',
        hubDigest,
        '',
      ]) {
        final fetch = await fetchWith({
          'x-hub-digest': hubDigest,
          'etag': etag,
        });
        expect((fetch as SnapshotFetchOk).digest, hubDigest, reason: etag);
      }
    });

    test('a weak ETag matching X-Hub-Digest is accepted', () async {
      final fetch = await fetchWith({
        'x-hub-digest': hubDigest,
        'etag': 'W/"$hubDigest"',
      });
      expect((fetch as SnapshotFetchOk).digest, hubDigest);
    });

    test('two valid digests that disagree are refused', () async {
      for (final etag in ['"$otherDigest"', 'W/"$otherDigest"']) {
        expect(
          snapshotKind(
            await fetchWith({'x-hub-digest': hubDigest, 'etag': etag}),
          ),
          SnapshotUnavailableKind.unavailable,
          reason: etag,
        );
      }
    });

    test('a malformed X-Hub-Digest or ETag alone is still refused', () async {
      for (final headers in [
        {'x-hub-digest': 'not-a-digest', 'etag': '"$hubDigest"'},
        {'etag': 'W/"not-a-digest"'},
        {'etag': 'w/"$hubDigest"'},
      ]) {
        expect(
          snapshotKind(await fetchWith(headers)),
          SnapshotUnavailableKind.unavailable,
          reason: '$headers',
        );
      }
    });

    test('a 304 with a weak ETag keeps the digest', () async {
      final hub = FakeHub(
        (_) => hubReply(304, headers: {'etag': 'W/"$hubDigest"'}),
      );
      final fetch = await hubSource(
        hub,
        FakeTokens(),
      ).fetchSnapshot(ifNoneMatch: '"$hubDigest"');
      expect((fetch as SnapshotFetchNotModified).digest, hubDigest);
    });
  });

  group('If-None-Match', () {
    for (final condition in ['"$hubDigest"', 'W/"$hubDigest"', hubDigest]) {
      test('$condition is sent in the strong form', () async {
        final hub = FakeHub((_) => hubReply(304));
        await hubSource(
          hub,
          FakeTokens(),
        ).fetchSnapshot(ifNoneMatch: condition);
        expect(hub.requests.single.headers['If-None-Match'], '"$hubDigest"');
      });
    }
  });

  group('size bound', () {
    test('the cache, parser and wire share one 4 MB cap', () {
      expect(HubHttpSnapshotSource.maxSnapshotBytes, 4000000);
      expect(
        mastermindSnapshotMaxBytes,
        HubHttpSnapshotSource.maxSnapshotBytes,
      );
      expect(HubHttpSnapshotSource.maxEventsBytes, 600000);
    });

    test('a snapshot above the former 600 KB cap is accepted', () async {
      final fetch = await hubSource(
        FakeHub((_) => _ok({'x-hub-digest': hubDigest}, bytes: 1500000)),
        FakeTokens(),
      ).fetchSnapshot();
      expect((fetch as SnapshotFetchOk).bytes.length, 1500000);
    });

    test('a snapshot one byte over the cap is refused', () async {
      final fetch = await hubSource(
        FakeHub(
          (_) => _ok({
            'x-hub-digest': hubDigest,
          }, bytes: HubHttpSnapshotSource.maxSnapshotBytes + 1),
        ),
        FakeTokens(),
      ).fetchSnapshot();
      expect(snapshotKind(fetch), SnapshotUnavailableKind.unavailable);
    });
  });

  group('unavailable diagnostics', () {
    Future<List<String>> diagnose(
      HubHandler handler, {
      Duration timeout = const Duration(seconds: 5),
    }) async {
      final log = <String>[];
      final fetch = await hubSource(
        FakeHub(handler),
        FakeTokens(),
        timeout: timeout,
        diagnostics: log,
      ).fetchSnapshot();
      expect(snapshotKind(fetch), SnapshotUnavailableKind.unavailable);
      return log;
    }

    test('each reason is recorded once, without secrets', () async {
      final cases = <String, HubHandler>{
        'status 503': (_) => hubReply(503, body: [1, 2, 3]),
        'bad-headers x-hub-digest+etag weak': (_) =>
            _ok({'x-hub-digest': hubDigest, 'etag': 'W/"$otherDigest"'}),
        'bad-headers none': (_) => _ok({}),
        'too-large': (_) => _ok({
          'x-hub-digest': hubDigest,
        }, bytes: HubHttpSnapshotSource.maxSnapshotBytes + 1),
        'transport ClientException': (_) =>
            throw http.ClientException('offline synthetic-token-1'),
      };
      for (final MapEntry(key: reason, value: handler) in cases.entries) {
        final log = await diagnose(handler);
        expect(log, ['Mastermind hub snapshot unavailable: $reason']);
        for (final secret in ['synthetic-token', hubDigest, otherDigest]) {
          expect(log.single, isNot(contains(secret)), reason: reason);
        }
      }
    });

    test('a timeout is recorded as such', () async {
      final hung = Completer<http.StreamedResponse>();
      final log = await diagnose(
        (_) => hung.future,
        timeout: const Duration(milliseconds: 20),
      );
      expect(log, ['Mastermind hub snapshot unavailable: timeout']);
    });

    test('access outcomes are not unavailable and are not recorded', () async {
      final log = <String>[];
      await hubSource(
        FakeHub((_) => hubReply(403)),
        FakeTokens(),
        diagnostics: log,
      ).fetchSnapshot();
      expect(log, isEmpty);
    });
  });
}
