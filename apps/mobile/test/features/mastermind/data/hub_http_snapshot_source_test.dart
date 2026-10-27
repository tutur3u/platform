import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

import '../../../helpers/mastermind_hub_harness.dart';

HubHttpSnapshotSource _source(
  FakeHub hub,
  FakeTokens tokens, {
  Duration timeout = const Duration(seconds: 5),
}) => HubHttpSnapshotSource(
  baseUrl: hubBase,
  tokens: tokens,
  client: hub.client,
  timeout: timeout,
  clock: () => DateTime.utc(2026, 10, 28, 7),
);

SnapshotUnavailableKind _kind(SnapshotFetch fetch) =>
    (fetch as SnapshotFetchUnavailable).kind;

const _emptyFeed = {
  'schema_version': '1.4',
  'after_seq': 5,
  'latest_seq': 5,
  'cursor_gap': false,
  'events': <Object>[],
};

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
          _kind(await source.fetchSnapshot()),
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
      final fetch = await _source(hub, tokens).fetchSnapshot();
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
      final source = _source(hub, tokens);
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
      final source = _source(hub, FakeTokens());
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
      final fetch = await _source(
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
        final fetch = await _source(
          hub,
          FakeTokens(),
        ).fetchSnapshot(ifNoneMatch: '"$hubDigest"');
        expect((fetch as SnapshotFetchNotModified).digest, otherDigest);
      },
    );

    test('304 to an unconditional request is not trusted', () async {
      final hub = FakeHub((_) => hubReply(304));
      expect(
        _kind(await _source(hub, FakeTokens()).fetchSnapshot()),
        SnapshotUnavailableKind.unavailable,
      );
    });

    test('a malformed If-None-Match is not forwarded', () async {
      final hub = FakeHub((_) => hubSnapshot());
      await _source(hub, FakeTokens()).fetchSnapshot(ifNoneMatch: 'W/"x"');
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
            _kind(await _source(hub, FakeTokens()).fetchSnapshot()),
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
        _kind(await _source(hub, FakeTokens()).fetchSnapshot()),
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
        _kind(await _source(hub, FakeTokens()).fetchSnapshot()),
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
        await _source(hub, FakeTokens()).fetchSnapshot(),
        isA<SnapshotFetchOk>(),
      );
    });
  });

  group('error mapping', () {
    final cases = <int, SnapshotUnavailableKind>{
      401: SnapshotUnavailableKind.unauthorized,
      403: SnapshotUnavailableKind.forbidden,
      404: SnapshotUnavailableKind.noSnapshot,
      429: SnapshotUnavailableKind.unavailable,
      500: SnapshotUnavailableKind.unavailable,
      503: SnapshotUnavailableKind.unavailable,
      302: SnapshotUnavailableKind.unavailable,
    };
    for (final entry in cases.entries) {
      test('${entry.key} -> ${entry.value.name}', () async {
        final hub = FakeHub((_) => hubError(entry.key, 'whatever'));
        expect(
          _kind(await _source(hub, FakeTokens()).fetchSnapshot()),
          entry.value,
        );
      });
    }

    test(
      '401 earns one silent refresh and one retry with the new token',
      () async {
        final hub = FakeHub(
          (r) => r.headers['Authorization'] == 'Bearer synthetic-token-2'
              ? hubSnapshot()
              : hubError(401, 'unauthorized'),
        );
        final tokens = FakeTokens(refreshed: 'synthetic-token-2');
        expect(
          await _source(hub, tokens).fetchSnapshot(),
          isA<SnapshotFetchOk>(),
        );
        expect(tokens.refreshes, 1);
        expect(hub.requests, hasLength(2));
      },
    );

    test('a second 401 is access lost, without a third request', () async {
      final hub = FakeHub((_) => hubError(401, 'unauthorized'));
      final tokens = FakeTokens(refreshed: 'synthetic-token-2');
      expect(
        _kind(await _source(hub, tokens).fetchSnapshot()),
        SnapshotUnavailableKind.unauthorized,
      );
      expect(tokens.refreshes, 1);
      expect(hub.requests, hasLength(2));
    });

    test('a 401 with no refreshable session stops after one request', () async {
      final hub = FakeHub((_) => hubError(401, 'unauthorized'));
      final tokens = FakeTokens();
      expect(
        _kind(await _source(hub, tokens).fetchSnapshot()),
        SnapshotUnavailableKind.unauthorized,
      );
      expect(hub.requests, hasLength(1));
    });

    test(
      'no session at all is unauthorized without touching the network',
      () async {
        final hub = FakeHub((_) => hubSnapshot());
        final tokens = FakeTokens(current: null);
        expect(
          _kind(await _source(hub, tokens).fetchSnapshot()),
          SnapshotUnavailableKind.unauthorized,
        );
        expect(hub.requests, isEmpty);
      },
    );

    test('a throwing token provider is unavailable, not access lost', () async {
      final hub = FakeHub((_) => hubSnapshot());
      final source = HubHttpSnapshotSource(
        baseUrl: hubBase,
        tokens: _ThrowingTokens(),
        client: hub.client,
      );
      expect(
        _kind(await source.fetchSnapshot()),
        SnapshotUnavailableKind.unavailable,
      );
      expect(hub.requests, isEmpty);
    });

    test('a retryable refresh failure keeps the cache: unavailable', () async {
      final hub = FakeHub((_) => hubSnapshot());
      final tokens = FakeTokens(current: null)
        ..refreshError = const SocketException('offline');
      final source = _source(hub, tokens);
      expect(
        _kind(await source.fetchSnapshot()),
        SnapshotUnavailableKind.unavailable,
      );
      expect(
        (await source.fetchEvents(digest: hubDigest, afterSeq: 0)
                as EventsFetchUnavailable)
            .kind,
        SnapshotUnavailableKind.unavailable,
      );
      expect(
        (await source.fetchCapabilities() as CapabilitiesFetchUnavailable).kind,
        SnapshotUnavailableKind.unavailable,
      );
      expect(tokens.refreshes, 3);
      expect(hub.requests, isEmpty);
    });

    test(
      'a 401 followed by a retryable refresh failure is unavailable',
      () async {
        final hub = FakeHub((_) => hubError(401, 'unauthorized'));
        final tokens = FakeTokens()..refreshError = TimeoutException(null);
        expect(
          _kind(await _source(hub, tokens).fetchSnapshot()),
          SnapshotUnavailableKind.unavailable,
        );
        expect(tokens.refreshes, 1);
        expect(hub.requests, hasLength(1));
      },
    );

    test('a session that is gone after a 401 is still access lost', () async {
      final hub = FakeHub((_) => hubError(401, 'unauthorized'));
      final tokens =
          FakeTokens(); // refreshed == null: refresh found no session
      expect(
        _kind(await _source(hub, tokens).fetchSnapshot()),
        SnapshotUnavailableKind.unauthorized,
      );
    });

    test('network failures and timeouts are unavailable', () async {
      final failing = FakeHub((_) => throw http.ClientException('offline'));
      expect(
        _kind(await _source(failing, FakeTokens()).fetchSnapshot()),
        SnapshotUnavailableKind.unavailable,
      );
      final hung = Completer<http.StreamedResponse>();
      final slow = FakeHub((_) => hung.future);
      expect(
        _kind(
          await _source(
            slow,
            FakeTokens(),
            timeout: const Duration(milliseconds: 20),
          ).fetchSnapshot(),
        ),
        SnapshotUnavailableKind.unavailable,
      );
    });

    test(
      'a body that stalls after the headers times out and is aborted',
      () async {
        var cancelled = false;
        final body = StreamController<List<int>>(
          onCancel: () => cancelled = true,
        );
        addTearDown(() async {
          if (!body.isClosed) await body.close();
        });
        final stalled = FakeHub(
          (_) => http.StreamedResponse(
            body.stream,
            200,
            headers: {'x-hub-digest': hubDigest, 'etag': '"$hubDigest"'},
          ),
        );
        final fetch = await _source(
          stalled,
          FakeTokens(),
          timeout: const Duration(milliseconds: 50),
        ).fetchSnapshot();
        expect(_kind(fetch), SnapshotUnavailableKind.unavailable);
        await pumpEventQueue();
      expect(stalled.requests.single.abortable, isTrue);
        expect(stalled.requests.single.aborted, isTrue);
        expect(cancelled, isTrue);
      },
    );

    test('a hung request is aborted when the timeout fires', () async {
      final hung = Completer<http.StreamedResponse>();
      final slow = FakeHub((_) => hung.future);
      await _source(
        slow,
        FakeTokens(),
        timeout: const Duration(milliseconds: 20),
      ).fetchSnapshot();
      await pumpEventQueue();
      expect(slow.requests.single.aborted, isTrue);
    });

    test('close leaves an injected client open', () async {
      final client = _CountingClient(FakeHub((_) => hubSnapshot()).client);
      HubHttpSnapshotSource(
        baseUrl: hubBase,
        tokens: FakeTokens(),
        client: client,
      ).close();
      expect(client.closed, 0);
    });
  });

  group('GET /v1/events', () {
    EventsFetchUnavailable unavailable(EventsFetch fetch) =>
        fetch as EventsFetchUnavailable;

    test('pins the digest and sends the cursor and limit', () async {
      final hub = FakeHub(
        (_) => hubReply(
          200,
          body: utf8.encode(jsonEncode(_emptyFeed)),
          headers: {'x-hub-digest': hubDigest},
        ),
      );
      final fetch = await _source(
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
        await _source(
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
        await _source(
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
          await _source(
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
            await _source(
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
          body: utf8.encode(jsonEncode(_emptyFeed)),
          headers: {'x-hub-digest': otherDigest},
        ),
      );
      expect(
        unavailable(
          await _source(
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
            jsonEncode({..._emptyFeed, 'schema_version': '1.3'}),
          ),
        ),
      );
      expect(
        unavailable(
          await _source(
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
        final source = _source(hub, FakeTokens());
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
      final fetch = await _source(hub, FakeTokens()).fetchCapabilities();
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
      final fetch = await _source(hub, FakeTokens()).fetchCapabilities();
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
          await _source(hub, FakeTokens()).fetchCapabilities(),
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
          final fetch = await _source(hub, FakeTokens()).fetchCapabilities();
          return (fetch as CapabilitiesFetchUnavailable).kind;
        }

        expect(await kind(403), SnapshotUnavailableKind.forbidden);
        expect(await kind(401), SnapshotUnavailableKind.unauthorized);
        expect(await kind(404), SnapshotUnavailableKind.unavailable);
      },
    );
  });
}

final class _ThrowingTokens implements AccessTokenProvider {
  @override
  Future<String?> currentAccessToken() async => throw StateError('no session');
  @override
  Future<String?> refreshAccessToken() async => throw StateError('no session');
}

final class _CountingClient extends http.BaseClient {
  _CountingClient(this._inner);
  final http.Client _inner;
  int closed = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      _inner.send(request);

  @override
  void close() => closed++;
}
