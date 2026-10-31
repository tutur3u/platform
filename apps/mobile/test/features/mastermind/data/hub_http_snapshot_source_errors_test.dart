import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

import '../../../helpers/hub_http_source_support.dart';
import '../../../helpers/mastermind_hub_harness.dart';

void main() {
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
          snapshotKind(await hubSource(hub, FakeTokens()).fetchSnapshot()),
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
          await hubSource(hub, tokens).fetchSnapshot(),
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
        snapshotKind(await hubSource(hub, tokens).fetchSnapshot()),
        SnapshotUnavailableKind.unauthorized,
      );
      expect(tokens.refreshes, 1);
      expect(hub.requests, hasLength(2));
    });

    test('a 401 with no refreshable session stops after one request', () async {
      final hub = FakeHub((_) => hubError(401, 'unauthorized'));
      final tokens = FakeTokens();
      expect(
        snapshotKind(await hubSource(hub, tokens).fetchSnapshot()),
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
          snapshotKind(await hubSource(hub, tokens).fetchSnapshot()),
          SnapshotUnavailableKind.unauthorized,
        );
        expect(hub.requests, isEmpty);
      },
    );

    test('a throwing token provider is unavailable, not access lost', () async {
      final hub = FakeHub((_) => hubSnapshot());
      final source = HubHttpSnapshotSource(
        baseUrl: hubBase,
        tokens: ThrowingTokens(),
        client: hub.client,
      );
      expect(
        snapshotKind(await source.fetchSnapshot()),
        SnapshotUnavailableKind.unavailable,
      );
      expect(hub.requests, isEmpty);
    });

    test('a retryable refresh failure keeps the cache: unavailable', () async {
      final hub = FakeHub((_) => hubSnapshot());
      final tokens = FakeTokens(current: null)
        ..refreshError = const SocketException('offline');
      final source = hubSource(hub, tokens);
      expect(
        snapshotKind(await source.fetchSnapshot()),
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
          snapshotKind(await hubSource(hub, tokens).fetchSnapshot()),
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
        snapshotKind(await hubSource(hub, tokens).fetchSnapshot()),
        SnapshotUnavailableKind.unauthorized,
      );
    });

    test('network failures and timeouts are unavailable', () async {
      final failing = FakeHub((_) => throw http.ClientException('offline'));
      expect(
        snapshotKind(await hubSource(failing, FakeTokens()).fetchSnapshot()),
        SnapshotUnavailableKind.unavailable,
      );
      final hung = Completer<http.StreamedResponse>();
      final slow = FakeHub((_) => hung.future);
      expect(
        snapshotKind(
          await hubSource(
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
        final fetch = await hubSource(
          stalled,
          FakeTokens(),
          timeout: const Duration(milliseconds: 50),
        ).fetchSnapshot();
        expect(snapshotKind(fetch), SnapshotUnavailableKind.unavailable);
        await pumpEventQueue();
        expect(stalled.requests.single.abortable, isTrue);
        expect(stalled.requests.single.aborted, isTrue);
        expect(cancelled, isTrue);
      },
    );

    test('a hung request is aborted when the timeout fires', () async {
      final hung = Completer<http.StreamedResponse>();
      final slow = FakeHub((_) => hung.future);
      await hubSource(
        slow,
        FakeTokens(),
        timeout: const Duration(milliseconds: 20),
      ).fetchSnapshot();
      await pumpEventQueue();
      expect(slow.requests.single.aborted, isTrue);
    });

    test('close leaves an injected client open', () async {
      final client = CountingClient(FakeHub((_) => hubSnapshot()).client);
      HubHttpSnapshotSource(
        baseUrl: hubBase,
        tokens: FakeTokens(),
        client: client,
      ).close();
      expect(client.closed, 0);
    });
  });
}
