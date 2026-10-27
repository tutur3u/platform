import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/file_snapshot_store.dart';
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import '../../../helpers/mastermind_hub_harness.dart';
import '../../../helpers/mastermind_snapshot_builder.dart';

/// The live HTTP source, the strict parser and the disk store working together
/// against a fake hub: nothing here touches the network.
void main() {
  late Directory base;
  late FileSnapshotStore store;
  late FakeHub hub;
  late FakeTokens tokens;

  MastermindSnapshotCubit cubit() => MastermindSnapshotCubit(
    source: HubHttpSnapshotSource(
      baseUrl: hubBase,
      tokens: tokens,
      client: hub.client,
      clock: () => DateTime.utc(2026, 10, 28, 7),
    ),
    store: store,
    parser: (bytes) async => parseMastermindSnapshot(bytes),
  );

  List<RecordedRequest> snapshotRequests() =>
      hub.requests.where((r) => r.url.path == '/v1/snapshot').toList();

  setUp(() {
    base = Directory.systemTemp.createTempSync('mastermind_live_');
    store = FileSnapshotStore(
      baseDirectory: () async => base,
      userId: () => 'user-a',
    );
    tokens = FakeTokens();
    hub = FakeHub((_) => hubSnapshot());
  });

  tearDown(() {
    if (base.existsSync()) base.deleteSync(recursive: true);
  });

  test('200 is accepted, shown as live and cached to disk', () async {
    final c = cubit();
    await c.refresh();
    final ready = c.state as MastermindSnapshotReady;
    expect(ready.origin, SnapshotOrigin.live);
    expect(ready.digest, hubDigest);
    expect(ready.refreshFailure, isNull);
    final stored = await store.read();
    expect(stored!.digest, hubDigest);
    expect(stored.bytes, isNotEmpty);
  });

  test(
    'relaunch shows the cache, then revalidates with the stored ETag',
    () async {
      await cubit().refresh();
      hub.requests.clear();
      hub.handler = (_) => hubReply(304, headers: {'etag': '"$hubDigest"'});
      final relaunched = cubit();
      final states = <MastermindSnapshotState>[];
      final sub = relaunched.stream.listen(states.add);
      await relaunched.ensureLoaded();
      await sub.cancel();
      expect(
        states.whereType<MastermindSnapshotReady>().first.origin,
        SnapshotOrigin.cache,
      );
      expect(
        snapshotRequests().single.headers['If-None-Match'],
        '"$hubDigest"',
      );
      final ready = relaunched.state as MastermindSnapshotReady;
      expect(ready.digest, hubDigest);
      expect(ready.origin, SnapshotOrigin.cache);
      expect(ready.refreshFailure, isNull);
      expect(ready.receivedAt, DateTime.utc(2026, 10, 28, 7));
    },
  );

  test('a 304 for a different digest is rejected, not trusted', () async {
    await cubit().refresh();
    hub.handler = (_) => hubReply(304, headers: {'x-hub-digest': otherDigest});
    final c = cubit();
    await c.ensureLoaded();
    final ready = c.state as MastermindSnapshotReady;
    expect(ready.digest, hubDigest);
    expect(
      (ready.refreshFailure as RejectedRefresh).reason,
      RejectionReason.schemaViolation,
    );
  });

  test('a non-1.4 snapshot is refused and never cached', () async {
    hub.handler = (_) => hubSnapshot(json: snapshotJson(schemaVersion: '1.3'));
    final c = cubit();
    await c.refresh();
    expect(
      (c.state as MastermindSnapshotRejected).reason,
      RejectionReason.unsupportedVersion,
    );
    expect(await store.read(), isNull);
  });

  test('a refused update keeps showing the last good snapshot', () async {
    await cubit().refresh();
    hub.handler = (_) => hubSnapshot(
      digest: otherDigest,
      json: snapshotJson(schemaVersion: '1.3'),
    );
    final c = cubit();
    await c.ensureLoaded();
    final ready = c.state as MastermindSnapshotReady;
    expect(ready.digest, hubDigest);
    expect(
      (ready.refreshFailure as RejectedRefresh).reason,
      RejectionReason.unsupportedVersion,
    );
    expect((await store.read())!.digest, hubDigest);
  });

  test('a cached 1.3 snapshot is ignored and erased', () async {
    final old = Uint8List.fromList(
      utf8.encode(jsonEncode(snapshotJson(schemaVersion: '1.3'))),
    );
    await store.write(old, DateTime.utc(2026), digest: otherDigest);
    hub.handler = (_) => hubError(503, 'unavailable');
    final c = cubit();
    await c.ensureLoaded();
    expect(
      (c.state as MastermindSnapshotUnavailable).kind,
      SnapshotUnavailableKind.unavailable,
    );
    expect(await store.read(), isNull);
  });

  for (final entry in {
    403: SnapshotUnavailableKind.forbidden,
    401: SnapshotUnavailableKind.unauthorized,
  }.entries) {
    test('${entry.key} loses access and clears memory and disk', () async {
      await cubit().refresh();
      expect(await store.read(), isNotNull);
      hub.handler = (_) => hubError(entry.key, 'denied');
      final c = cubit();
      await c.refresh();
      expect((c.state as MastermindSnapshotUnavailable).kind, entry.value);
      expect(await store.read(), isNull);
      expect(Directory('${base.path}/mastermind').existsSync(), isFalse);
    });
  }

  test(
    'network failure keeps the cached snapshot with a refresh failure',
    () async {
      await cubit().refresh();
      hub.handler = (_) => throw const SocketException('offline');
      final c = cubit();
      await c.ensureLoaded();
      final ready = c.state as MastermindSnapshotReady;
      expect(ready.origin, SnapshotOrigin.cache);
      expect(
        (ready.refreshFailure as UnavailableRefresh).kind,
        SnapshotUnavailableKind.unavailable,
      );
      expect(await store.read(), isNotNull);
    },
  );

  test('404 with nothing cached is the no-snapshot state', () async {
    hub.handler = (_) => hubError(404, 'no_snapshot');
    final c = cubit();
    await c.refresh();
    expect(
      (c.state as MastermindSnapshotUnavailable).kind,
      SnapshotUnavailableKind.noSnapshot,
    );
  });

  test('logout clears the cubit and the disk cache', () async {
    final c = cubit();
    await c.refresh();
    await c.clear();
    expect(c.state, isA<MastermindSnapshotInitial>());
    expect(await store.read(), isNull);
  });

  test('an account switch never reads the previous account cache', () async {
    var user = 'user-a';
    final switching = FileSnapshotStore(
      baseDirectory: () async => base,
      userId: () => user,
    );
    await switching.write(
      MastermindSnapshotBuilder.defaults().bytes(),
      DateTime.utc(2026),
      digest: hubDigest,
    );
    user = 'user-b';
    final c = MastermindSnapshotCubit(
      source: HubHttpSnapshotSource(
        baseUrl: hubBase,
        tokens: tokens,
        client: hub.client,
      ),
      store: switching,
      parser: (bytes) async => parseMastermindSnapshot(bytes),
    );
    await c.refresh();
    // No cache for user-b, so the request is unconditional.
    expect(
      snapshotRequests().single.headers.containsKey('If-None-Match'),
      isFalse,
    );
  });

  group('events recovery', () {
    FakeHub eventsHub(http.StreamedResponse Function() reply) =>
        FakeHub((r) => r.url.path == '/v1/events' ? reply() : hubSnapshot());

    test('409 cursor_ahead adopts a fresh unconditional snapshot', () async {
      hub = eventsHub(() => hubError(409, 'cursor_ahead'));
      final source = HubHttpSnapshotSource(
        baseUrl: hubBase,
        tokens: tokens,
        client: hub.client,
      );
      final c = MastermindSnapshotCubit(
        source: source,
        store: store,
        parser: (bytes) async => parseMastermindSnapshot(bytes),
      );
      await c.refresh();
      hub.requests.clear();
      final failure =
          await source.fetchEvents(digest: hubDigest, afterSeq: 999)
              as EventsFetchUnavailable;
      expect(failure.needsResync, isTrue);
      await c.recoverFromEvents(failure);
      final request = snapshotRequests().single;
      expect(request.headers.containsKey('If-None-Match'), isFalse);
      expect(c.state, isA<MastermindSnapshotReady>());
    });

    test('404 for a gone digest also refetches once', () async {
      hub = eventsHub(() => hubError(404, 'no_export'));
      final source = HubHttpSnapshotSource(
        baseUrl: hubBase,
        tokens: tokens,
        client: hub.client,
      );
      final c = MastermindSnapshotCubit(
        source: source,
        store: store,
        parser: (bytes) async => parseMastermindSnapshot(bytes),
      );
      await c.refresh();
      hub.requests.clear();
      final failure =
          await source.fetchEvents(digest: hubDigest, afterSeq: 1)
              as EventsFetchUnavailable;
      await c.recoverFromEvents(failure);
      expect(snapshotRequests(), hasLength(1));
    });

    test('other event failures do not refetch', () async {
      hub = eventsHub(() => hubError(500, 'x'));
      final source = HubHttpSnapshotSource(
        baseUrl: hubBase,
        tokens: tokens,
        client: hub.client,
      );
      final c = MastermindSnapshotCubit(
        source: source,
        store: store,
        parser: (bytes) async => parseMastermindSnapshot(bytes),
      );
      await c.refresh();
      hub.requests.clear();
      final failure =
          await source.fetchEvents(digest: hubDigest, afterSeq: 1)
              as EventsFetchUnavailable;
      await c.recoverFromEvents(failure);
      expect(snapshotRequests(), isEmpty);
    });
  });
}
