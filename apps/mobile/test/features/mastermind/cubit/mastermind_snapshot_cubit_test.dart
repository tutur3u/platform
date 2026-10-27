import 'dart:async';
import 'dart:typed_data';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';
import 'package:mobile/features/mastermind/data/unconfigured_snapshot_source.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import '../../../helpers/mastermind_snapshot_builder.dart';

const _digest =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

class _Source implements MastermindSnapshotSource {
  Future<SnapshotFetch> Function()? fetcher;
  int calls = 0;
  String? lastIfNoneMatch;
  @override
  Future<EventsFetch> fetchEvents({
    required String digest,
    required int afterSeq,
    int limit = 100,
  }) async =>
      const EventsFetch.unavailable(SnapshotUnavailableKind.unavailable);
  @override
  bool get isConfigured => true;
  @override
  Future<SnapshotFetch> fetchSnapshot({String? ifNoneMatch}) async {
    calls++;
    lastIfNoneMatch = ifNoneMatch;
    return await (fetcher?.call() ??
        SnapshotFetch.ok(
          MastermindSnapshotBuilder.defaults().bytes(),
          DateTime.utc(2026),
          digest: _digest,
          origin: SnapshotOrigin.fixture,
        ));
  }
}

class _DelayedStore implements MastermindSnapshotStore {
  final _store = MemorySnapshotStore();
  @override
  Future<StoredSnapshot?> read() => _store.read();
  @override
  Future<void> clear() => _store.clear();
  final started = Completer<void>();
  final release = Completer<void>();
  @override
  Future<void> write(
    Uint8List bytes,
    DateTime receivedAt, {
    required String digest,
  }) async {
    started.complete();
    await release.future;
    await _store.write(bytes, receivedAt, digest: digest);
  }
}

void main() {
  MastermindSnapshotCubit build({
    _Source? source,
    MastermindSnapshotStore? store,
  }) => MastermindSnapshotCubit(
    source: source ?? _Source(),
    store: store ?? MemorySnapshotStore(),
    clock: () => DateTime.utc(2026),
  );

  blocTest<MastermindSnapshotCubit, MastermindSnapshotState>(
    'loading then ready with isolate parser',
    build: build,
    act: (c) => c.ensureLoaded(),
    expect: () => [
      isA<MastermindSnapshotLoading>(),
      isA<MastermindSnapshotReady>().having(
        (s) => s.origin,
        'origin',
        SnapshotOrigin.fixture,
      ),
    ],
  );
  blocTest<MastermindSnapshotCubit, MastermindSnapshotState>(
    'unconfigured source does not fetch or read cached data',
    build: () => MastermindSnapshotCubit(
      source: const UnconfiguredSnapshotSource(),
      store: MemorySnapshotStore(),
    ),
    act: (c) => c.ensureLoaded(),
    expect: () => [isA<MastermindSnapshotNotConfigured>()],
  );
  test('rejected refresh retains previous ready snapshot', () async {
    final source = _Source();
    final c = build(source: source);
    await c.ensureLoaded();
    final previous = (c.state as MastermindSnapshotReady).snapshot;
    source.fetcher = () async => SnapshotFetch.ok(
      Uint8List.fromList([123]),
      DateTime.utc(2026),
      digest: _digest,
    );
    await c.refresh();
    final state = c.state as MastermindSnapshotReady;
    expect(identical(state.snapshot, previous), isTrue);
    expect(
      (state.refreshFailure! as RejectedRefresh).reason,
      RejectionReason.malformedJson,
    );
    await c.close();
  });
  test('cold rejection is categorized', () async {
    final source = _Source()
      ..fetcher = () async => SnapshotFetch.ok(
        Uint8List(600001),
        DateTime.utc(2026),
        digest: _digest,
      );
    final c = build(source: source);
    await c.ensureLoaded();
    expect(
      (c.state as MastermindSnapshotRejected).reason,
      RejectionReason.tooLarge,
    );
    await c.close();
  });
  test('clear invalidates pending fetch and permits a new load', () async {
    final pending = Completer<SnapshotFetch>();
    final source = _Source()..fetcher = () => pending.future;
    final store = MemorySnapshotStore();
    final c = build(source: source, store: store);
    final first = c.ensureLoaded();
    await Future<void>.delayed(Duration.zero);
    await c.clear();
    expect(c.state, isA<MastermindSnapshotInitial>());
    source.fetcher = null;
    await c.ensureLoaded();
    final latest = c.state;
    pending.complete(
      SnapshotFetch.ok(Uint8List(600001), DateTime.utc(2026), digest: _digest),
    );
    await first;
    expect(identical(c.state, latest), isTrue);
    await c.clear();
    expect(await store.read(), isNull);
    await c.close();
  });
  test('clear erases a delayed store write before it completes', () async {
    final store = _DelayedStore();
    final c = build(store: store);
    final loading = c.ensureLoaded();
    await store.started.future;
    final clear = c.clear();
    expect(c.state, isA<MastermindSnapshotInitial>());
    store.release.complete();
    await loading;
    await clear;
    expect(await store.read(), isNull);
    await c.close();
  });
  test(
    'ensureLoaded deduplicates and loaded state does not fetch again',
    () async {
      final source = _Source();
      final c = build(source: source);
      await Future.wait([c.ensureLoaded(), c.ensureLoaded()]);
      await c.ensureLoaded();
      expect(source.calls, 1);
      await c.close();
    },
  );
  test(
    'cache is parsed before source and rejected source keeps cached snapshot',
    () async {
      final store = MemorySnapshotStore();
      await store.write(
        MastermindSnapshotBuilder.defaults().bytes(),
        DateTime.utc(2025),
        digest: _digest,
      );
      final source = _Source()
        ..fetcher = () async => SnapshotFetch.ok(
          Uint8List(600001),
          DateTime.utc(2026),
          digest: _digest,
        );
      final c = build(source: source, store: store);
      await c.ensureLoaded();
      final state = c.state as MastermindSnapshotReady;
      expect(state.origin, SnapshotOrigin.cache);
      expect(state.receivedAt, DateTime.utc(2025));
      expect(state.refreshFailure, isA<RejectedRefresh>());
      await c.close();
    },
  );
  test('unavailable refresh preserves accepted data', () async {
    final source = _Source();
    final c = build(source: source);
    await c.ensureLoaded();
    source.fetcher = () async =>
        const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
    await c.refresh();
    expect(
      (c.state as MastermindSnapshotReady).refreshFailure,
      isA<UnavailableRefresh>(),
    );
    await c.close();
  });
  test('memory store owns immutable bytes', () async {
    final bytes = Uint8List.fromList([1, 2]);
    final store = MemorySnapshotStore();
    await store.write(bytes, DateTime.utc(2026), digest: _digest);
    bytes[0] = 9;
    final cached = (await store.read())!;
    expect(cached.bytes[0], 1);
    expect(() => cached.bytes[0] = 7, throwsUnsupportedError);
  });
  test(
    'conditional refresh preserves snapshot identity and clears failure',
    () async {
      final source = _Source();
      final c = build(source: source);
      await c.ensureLoaded();
      final previous = (c.state as MastermindSnapshotReady).snapshot;
      source.fetcher = () async =>
          SnapshotFetch.notModified(_digest, DateTime.utc(2026, 2));
      await c.refresh();
      final state = c.state as MastermindSnapshotReady;
      expect(source.lastIfNoneMatch, '"$_digest"');
      expect(identical(state.snapshot, previous), isTrue);
      expect(state.digest, _digest);
      expect(state.receivedAt, DateTime.utc(2026, 2));
      expect(state.refreshFailure, isNull);
      await c.close();
    },
  );
  test('notModified cannot introduce a different digest', () async {
    final source = _Source();
    final c = build(source: source);
    await c.ensureLoaded();
    source.fetcher = () async =>
        SnapshotFetch.notModified('b' * 64, DateTime.utc(2026));
    await c.refresh();
    expect(
      (c.state as MastermindSnapshotReady).refreshFailure,
      isA<RejectedRefresh>(),
    );
    await c.close();
  });
}
