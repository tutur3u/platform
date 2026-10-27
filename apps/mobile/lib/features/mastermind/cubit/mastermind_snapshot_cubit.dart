import 'package:bloc/bloc.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_state.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';
import 'package:mobile/features/mastermind/model/event_feed.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/presentation/snapshot_age.dart';

export 'package:mobile/features/mastermind/model/event_feed.dart'
    show EventFeedAppend, EventFeedResync, EventFeedStep;
export 'mastermind_snapshot_state.dart';

typedef SnapshotParser = Future<ParseOutcome> Function(Uint8List bytes);

final class MastermindSnapshotCubit extends Cubit<MastermindSnapshotState> {
  MastermindSnapshotCubit({
    required MastermindSnapshotSource source,
    required MastermindSnapshotStore store,
    Clock? clock,
    SnapshotParser? parser,
  }) : _source = source,
       _store = store,
       clock = clock ?? DateTime.now,
       _parser = parser ?? _parseInIsolate,
       super(const MastermindSnapshotInitial());

  final MastermindSnapshotSource _source;
  final MastermindSnapshotStore _store;
  final SnapshotParser _parser;
  final Clock clock;
  int _generation = 0;
  Future<void>? _pending;
  Future<void> _storeTail = Future<void>.value();

  static Future<ParseOutcome> _parseInIsolate(Uint8List bytes) =>
      compute(parseMastermindSnapshot, bytes);

  Future<void> ensureLoaded() {
    if (_pending != null) return _pending!;
    if (state is! MastermindSnapshotInitial) return Future<void>.value();
    return refresh();
  }

  Future<void> refresh() => _refresh(conditional: true);

  /// Adopts a fresh snapshot with no `If-None-Match`, for when the held export
  /// no longer matches what the events route knows (409 `cursor_ahead`, or 404
  /// for a digest the pointer moved past). The cursor then restarts from the
  /// fresh snapshot's `latest_seq`.
  Future<void> recoverFromEvents(EventsFetchUnavailable failure) =>
      failure.needsResync ||
          failure.kind == SnapshotUnavailableKind.digestNotFound
      ? _refresh(conditional: false)
      : Future<void>.value();

  Future<void> _refresh({required bool conditional}) {
    if (_pending != null) return _pending!;
    final generation = _generation;
    final future = _load(generation, conditional: conditional);
    _pending = future;
    return future.whenComplete(() {
      if (identical(_pending, future)) _pending = null;
    });
  }

  bool _current(int generation) => !isClosed && generation == _generation;

  Future<void> _storeOperation(Future<void> Function() operation) {
    final future = _storeTail.then((_) => operation());
    _storeTail = future.then<void>((_) {}, onError: (Object _) {});
    return future;
  }

  Future<void> _load(int generation, {required bool conditional}) async {
    if (!_source.isConfigured) {
      emit(const MastermindSnapshotNotConfigured());
      return;
    }
    var previous = state is MastermindSnapshotReady
        ? state as MastermindSnapshotReady
        : null;
    emit(MastermindSnapshotLoading(previous: previous));
    if (previous == null) {
      try {
        await _storeTail;
        final cached = await _store.read();
        if (!_current(generation)) return;
        if (cached != null) {
          final parsed = await _parser(cached.bytes);
          if (!_current(generation)) return;
          if (parsed is ParseAccepted) {
            previous = MastermindSnapshotReady(
              snapshot: parsed.snapshot,
              digest: cached.digest,
              origin: SnapshotOrigin.cache,
              receivedAt: cached.receivedAt,
            );
            emit(previous);
          } else {
            // A cache from an older schema (or damaged) is never trusted.
            await _storeOperation(_store.clear);
          }
        }
      } on Object {
        /* A cache failure does not block the source. */
      }
    }
    final SnapshotFetch fetched;
    try {
      if (!_current(generation)) return;
      fetched = await _source.fetchSnapshot(
        ifNoneMatch: previous == null || !conditional
            ? null
            : '"${previous.digest}"',
      );
    } on Object {
      if (!_current(generation)) return;
      await _emitUnavailable(
        SnapshotUnavailableKind.unavailable,
        previous,
        generation,
      );
      return;
    }
    if (!_current(generation)) return;
    switch (fetched) {
      case SnapshotFetchUnavailable(:final kind):
        await _emitUnavailable(kind, previous, generation);
      case SnapshotFetchNotModified(:final digest, :final receivedAt):
        if (previous == null || previous.digest != digest) {
          emit(
            previous?.withFailure(
                  const RejectedRefresh(RejectionReason.schemaViolation),
                ) ??
                const MastermindSnapshotRejected(
                  RejectionReason.schemaViolation,
                ),
          );
        } else {
          emit(
            MastermindSnapshotReady(
              snapshot: previous.snapshot,
              digest: digest,
              origin: previous.origin,
              receivedAt: receivedAt,
            ),
          );
        }
      case SnapshotFetchOk(
        :final bytes,
        :final receivedAt,
        :final origin,
        :final digest,
      ):
        final outcome = await _parser(bytes);
        if (!_current(generation)) return;
        switch (outcome) {
          case ParseRejected(:final reason):
            emit(
              previous?.withFailure(RejectedRefresh(reason)) ??
                  MastermindSnapshotRejected(reason),
            );
          case ParseAccepted(:final snapshot):
            emit(
              MastermindSnapshotReady(
                snapshot: snapshot,
                digest: digest,
                origin: origin,
                receivedAt: receivedAt,
              ),
            );
            try {
              await _storeOperation(() async {
                if (_current(generation)) {
                  await _store.write(bytes, receivedAt, digest: digest);
                }
              });
            } on Object {
              /* The accepted snapshot remains available in memory. */
            }
        }
    }
  }

  /// 401/403 mean this device may no longer hold the data: drop it from memory
  /// and disk. Other failures keep whatever was already accepted.
  Future<void> _emitUnavailable(
    SnapshotUnavailableKind kind,
    MastermindSnapshotReady? previous,
    int generation,
  ) async {
    if (kind.isAccessLost) {
      emit(MastermindSnapshotUnavailable(kind));
      try {
        await _storeOperation(_store.clear);
      } on Object {
        /* The in-memory state is already cleared. */
      }
      return;
    }
    if (previous != null) {
      emit(previous.withFailure(UnavailableRefresh(kind)));
    } else if (kind == SnapshotUnavailableKind.notConfigured) {
      emit(const MastermindSnapshotNotConfigured());
    } else {
      emit(MastermindSnapshotUnavailable(kind));
    }
  }

  /// Applies one events page against the cursor implied by the held snapshot.
  /// A gap (the first schema 1.4 feed, retention, or an older export) adopts
  /// the fresh snapshot instead of applying events, which resets the cursor to
  /// that snapshot's `latest_seq`.
  ///
  /// Not wired to a poller yet, so the cursor is derived from the held
  /// snapshot. Once it is, keep the cursor in [MastermindSnapshotReady] beside
  /// the digest: advance it to [EventFeedAppend.cursor] and reset it to the
  /// fresh snapshot's `latest_seq` on a resync or
  /// [EventsFetchUnavailable.needsResync].
  Future<EventFeedStep> applyEventFeed(MastermindEventFeed feed) async {
    final current = state;
    final cursor = current is MastermindSnapshotReady
        ? current.snapshot.now.latestSeq
        : 0;
    final step = reconcileEventFeed(cursor: cursor, feed: feed);
    if (step is EventFeedResync) await refresh();
    return step;
  }

  /// Invalidates in-flight reads; erasure follows any admitted write.
  Future<void> clear() {
    ++_generation;
    _pending = null;
    emit(const MastermindSnapshotInitial());
    return _storeOperation(_store.clear);
  }
}
