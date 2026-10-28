import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

import '../../../helpers/hub_http_source_support.dart';
import '../../../helpers/mastermind_hub_harness.dart';

void main() {
  group('configuration fails closed', () {
    test('base URL by flavor and override', () {
      expect(
        MastermindHubConfig.resolve(flavor: 'production', override: ''),
        Uri.parse('https://mastermind-hub.tutur3u.com'),
      );
      expect(
        MastermindHubConfig.resolve(flavor: 'staging', override: ''),
        Uri.parse('https://mastermind-hub-staging.tutur3u.com'),
      );
      expect(
        MastermindHubConfig.resolve(flavor: 'development', override: ''),
        isNull,
      );
      expect(MastermindHubConfig.resolve(override: ''), isNull);
      expect(
        MastermindHubConfig.resolve(
          flavor: 'production',
          override: 'https://hub.example.test',
        ),
        hubBase,
      );
    });

    test('only a bare HTTPS origin is accepted', () {
      for (final bad in [
        'http://hub.example.test',
        'https://user:pw@hub.example.test',
        'https://hub.example.test/v1',
        'https://hub.example.test?x=1',
        'https://hub.example.test#frag',
        'hub.example.test',
        '',
      ]) {
        expect(MastermindHubConfig.parseBaseUrl(bad), isNull, reason: bad);
      }
      // A bad override never falls back to the flavor host.
      expect(
        MastermindHubConfig.resolve(
          flavor: 'production',
          override: 'http://hub.example.test',
        ),
        isNull,
      );
    });

    test('an unconfigured source sends nothing', () async {
      final hub = FakeHub((_) => hubSnapshot());
      for (final base in [null, Uri.parse('http://hub.example.test')]) {
        final tokens = FakeTokens();
        final source = HubHttpSnapshotSource(
          baseUrl: base,
          tokens: tokens,
          client: hub.client,
        );
        expect(source.isConfigured, isFalse);
        expect(
          snapshotKind(await source.fetchSnapshot()),
          SnapshotUnavailableKind.notConfigured,
        );
        expect(
          (await source.fetchEvents(digest: hubDigest, afterSeq: 0))
              as EventsFetchUnavailable,
          isA<EventsFetchUnavailable>().having(
            (e) => e.kind,
            'kind',
            SnapshotUnavailableKind.notConfigured,
          ),
        );
        expect(
          await source.fetchCapabilities(),
          isA<CapabilitiesFetchUnavailable>(),
        );
        expect(tokens.reads, 0);
      }
      expect(hub.requests, isEmpty);
    });
  });

  group('GET /v1/snapshot', () {
    test('200 carries bytes and the X-Hub-Digest identity', () async {
      final hub = FakeHub((_) => hubSnapshot());
      final tokens = FakeTokens();
      final fetch = await hubSource(hub, tokens).fetchSnapshot();
      final ok = fetch as SnapshotFetchOk;
      expect(ok.digest, hubDigest);
      expect(ok.etag, '"$hubDigest"');
      expect(ok.origin, SnapshotOrigin.live);
      expect(ok.receivedAt, DateTime.utc(2026, 10, 28, 7));
      expect(ok.bytes, isNotEmpty);
      final request = hub.requests.single;
      expect(request.method, 'GET');
      expect(request.url, Uri.parse('https://hub.example.test/v1/snapshot'));
      expect(request.headers['Authorization'], 'Bearer synthetic-token-1');
      expect(request.headers.containsKey('If-None-Match'), isFalse);
      expect(request.followRedirects, isFalse);
    });

    test('the token is read from the session on every request', () async {
      final hub = FakeHub((_) => hubSnapshot());
      final tokens = FakeTokens();
      final source = hubSource(hub, tokens);
      await source.fetchSnapshot();
      tokens.current = 'synthetic-token-2';
      await source.fetchSnapshot();
      expect(tokens.reads, 2);
      expect(hub.requests.map((r) => r.headers['Authorization']), [
        'Bearer synthetic-token-1',
        'Bearer synthetic-token-2',
      ]);
    });

    test('ETag round-trip: 200, then 304 for the same digest', () async {
      var calls = 0;
      final hub = FakeHub(
        (request) => calls++ == 0
            ? hubSnapshot()
            : hubReply(304, headers: {'etag': '"$hubDigest"'}),
      );
      final source = hubSource(hub, FakeTokens());
      final first = await source.fetchSnapshot() as SnapshotFetchOk;
      final second =
          await source.fetchSnapshot(ifNoneMatch: first.etag)
              as SnapshotFetchNotModified;
      expect(hub.requests.last.headers['If-None-Match'], '"$hubDigest"');
      expect(second.digest, hubDigest);
      expect(second.receivedAt, DateTime.utc(2026, 10, 28, 7));
    });

    test('304 without headers keeps the digest that was sent', () async {
      final hub = FakeHub((_) => hubReply(304));
      final fetch = await hubSource(
        hub,
        FakeTokens(),
      ).fetchSnapshot(ifNoneMatch: hubDigest);
      expect((fetch as SnapshotFetchNotModified).digest, hubDigest);
      expect(hub.requests.single.headers['If-None-Match'], '"$hubDigest"');
    });

    test(
      'a 304 naming another digest is surfaced for the cubit to reject',
      () async {
        final hub = FakeHub(
          (_) => hubReply(304, headers: {'x-hub-digest': otherDigest}),
        );
        final fetch = await hubSource(
          hub,
          FakeTokens(),
        ).fetchSnapshot(ifNoneMatch: '"$hubDigest"');
        expect((fetch as SnapshotFetchNotModified).digest, otherDigest);
      },
    );

    test('304 to an unconditional request is not trusted', () async {
      final hub = FakeHub((_) => hubReply(304));
      expect(
        snapshotKind(await hubSource(hub, FakeTokens()).fetchSnapshot()),
        SnapshotUnavailableKind.unavailable,
      );
    });

    test('a malformed If-None-Match is not forwarded', () async {
      final hub = FakeHub((_) => hubSnapshot());
      await hubSource(hub, FakeTokens()).fetchSnapshot(ifNoneMatch: 'W/"x"');
      expect(hub.requests.single.headers.containsKey('If-None-Match'), isFalse);
    });

    test(
      'missing, malformed or disagreeing digest headers are refused',
      () async {
        final replies = <Map<String, String>>[
          {},
          {'x-hub-digest': 'not-a-digest'},
          {'x-hub-digest': hubDigest, 'etag': '"$otherDigest"'},
          {'etag': hubDigest},
        ];
        for (final headers in replies) {
          final hub = FakeHub(
            (_) => hubReply(200, body: utf8.encode('{}'), headers: headers),
          );
          expect(
            snapshotKind(await hubSource(hub, FakeTokens()).fetchSnapshot()),
            SnapshotUnavailableKind.unavailable,
            reason: '$headers',
          );
        }
      },
    );

    test('a declared oversize body is refused', () async {
      final hub = FakeHub(
        (_) => hubReply(
          200,
          body: Uint8List(10),
          headers: {'x-hub-digest': hubDigest},
          contentLength: HubHttpSnapshotSource.maxSnapshotBytes + 1,
        ),
      );
      expect(
        snapshotKind(await hubSource(hub, FakeTokens()).fetchSnapshot()),
        SnapshotUnavailableKind.unavailable,
      );
    });

    test('a streamed oversize body stops at the cap', () async {
      var chunks = 0;
      final hub = FakeHub((_) {
        final stream = () async* {
          while (chunks < 100) {
            chunks++;
            yield Uint8List(10000);
          }
        }();
        return http.StreamedResponse(
          stream,
          200,
          headers: {'x-hub-digest': hubDigest},
        );
      });
      expect(
        snapshotKind(await hubSource(hub, FakeTokens()).fetchSnapshot()),
        SnapshotUnavailableKind.unavailable,
      );
      expect(chunks, lessThan(100));
    });

    test('a body exactly at the cap is accepted', () async {
      final hub = FakeHub(
        (_) => hubReply(
          200,
          body: Uint8List(HubHttpSnapshotSource.maxSnapshotBytes),
          headers: {'x-hub-digest': hubDigest},
        ),
      );
      expect(
        await hubSource(hub, FakeTokens()).fetchSnapshot(),
        isA<SnapshotFetchOk>(),
      );
    });
  });
}
