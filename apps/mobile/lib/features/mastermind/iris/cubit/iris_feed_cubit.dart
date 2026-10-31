import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

final class IrisFeedState {
  const IrisFeedState({
    this.messages = const [],
    this.loaded = false,
    this.loadingOlder = false,
    this.nextBefore,
    this.failure,
    this.summary,
  });

  /// Oldest first (newest last), at most [IrisFeedCubit.maxMessages].
  final List<ThreadMessage> messages;
  final bool loaded;
  final bool loadingOlder;
  final String? nextBefore;

  /// The last poll's failure; cleared by the next success.
  final IrisFailure? failure;

  /// The relay's "What needs me" extras (role status, usage line), refreshed
  /// at most once a minute; null until one arrives.
  final IrisSummary? summary;

  /// The kill switch is on: the feed stays readable, sending is off.
  bool get killed => failure?.kind == IrisFailureKind.killed;

  IrisFeedState copyWith({
    List<ThreadMessage>? messages,
    bool? loaded,
    bool? loadingOlder,
    String? Function()? nextBefore,
    IrisFailure? Function()? failure,
    IrisSummary? summary,
  }) => IrisFeedState(
    messages: messages ?? this.messages,
    loaded: loaded ?? this.loaded,
    loadingOlder: loadingOlder ?? this.loadingOlder,
    nextBefore: nextBefore == null ? this.nextBefore : nextBefore(),
    failure: failure == null ? this.failure : failure(),
    summary: summary ?? this.summary,
  );
}

/// The chat feed: the latest page, then a forward poll every 15 s while the
/// segment is visible, backing off on failure. History lives in memory only
/// and is dropped by [clear] (app lock, background, workspace change).
class IrisFeedCubit extends Cubit<IrisFeedState> {
  IrisFeedCubit({
    required IrisRelay relay,
    IrisBackoff? backoff,
    DateTime Function()? clock,
  }) : _relay = relay,
       _backoff = backoff ?? IrisBackoff(),
       _clock = clock ?? DateTime.now,
       super(const IrisFeedState());

  static const maxMessages = 500;

  /// Matches the relay's default page `limit`.
  static const pageSize = 50;
  static const summaryEvery = Duration(minutes: 1);

  final IrisRelay _relay;
  final IrisBackoff _backoff;
  final DateTime Function() _clock;
  DateTime? _summaryAt;
  Timer? _timer;
  String? _after;
  bool _running = false;
  Future<void>? _inFlight;

  /// Loads (or resumes) and keeps polling until [stop].
  void start() {
    if (_running || isClosed) return;
    _running = true;
    unawaited(poll());
  }

  void stop() {
    _running = false;
    _timer?.cancel();
    _timer = null;
  }

  /// Drops everything held in memory; the next [start] reloads.
  void clear() {
    stop();
    _after = null;
    _summaryAt = null;
    if (!isClosed) emit(const IrisFeedState());
  }

  /// One fetch now: the latest page first, then forward from the cursor.
  Future<void> poll() =>
      _inFlight ??= _poll().whenComplete(() => _inFlight = null);

  Future<void> _poll() async {
    _timer?.cancel();
    final after = _after;
    final result = after == null
        ? await _relay.feed()
        : await _relay.feed(after: after);
    if (isClosed) return;
    switch (result) {
      case IrisOk(:final value):
        _backoff.succeeded();
        _accept(value, latest: after == null);
        await _refreshSummary();
        // A full forward page means more are waiting: fetch on at once.
        if (after != null && value.messages.length == pageSize) {
          await _poll();
          return;
        }
        _schedule(_backoff.next());
      case IrisErr(:final failure):
        if (failure.kind == IrisFailureKind.notFound && after != null) {
          // The cursor is gone (relay restart): start over from the latest.
          _after = null;
          emit(const IrisFeedState());
          await _poll();
          return;
        }
        emit(state.copyWith(loaded: true, failure: () => failure));
        _schedule(_backoff.next(failure));
    }
  }

  void _accept(IrisFeedPage page, {required bool latest}) {
    final merged = latest
        ? [...page.messages]
        : _merge(state.messages, page.messages);
    final trimmed = merged.length > maxMessages
        ? merged.sublist(merged.length - maxMessages)
        : merged;
    _after = page.nextAfter ?? (trimmed.isEmpty ? _after : trimmed.last.ref);
    emit(
      state.copyWith(
        messages: List.unmodifiable(trimmed),
        loaded: true,
        nextBefore: latest ? () => page.nextBefore : null,
        failure: () => null,
      ),
    );
  }

  /// Best effort: a failed summary keeps the last one and never fails the
  /// feed.
  Future<void> _refreshSummary() async {
    final at = _summaryAt;
    final now = _clock();
    if (at != null && now.difference(at) < summaryEvery) return;
    _summaryAt = now;
    final result = await _relay.summary();
    if (isClosed) return;
    if (result case IrisOk(:final value)) emit(state.copyWith(summary: value));
  }

  void _schedule(Duration wait) {
    if (!_running || isClosed) return;
    _timer = Timer(wait, () => unawaited(poll()));
  }

  /// Pages back once from the oldest row held.
  Future<void> loadOlder() async {
    final before = state.nextBefore;
    if (before == null || state.loadingOlder || isClosed) return;
    emit(state.copyWith(loadingOlder: true));
    final result = await _relay.feed(before: before);
    if (isClosed) return;
    switch (result) {
      case IrisOk(:final value):
        final merged = _merge(value.messages, state.messages);
        emit(
          state.copyWith(
            messages: List.unmodifiable(
              merged.length > maxMessages
                  ? merged.sublist(0, maxMessages)
                  : merged,
            ),
            loadingOlder: false,
            nextBefore: () => value.nextBefore,
          ),
        );
      case IrisErr(:final failure):
        emit(state.copyWith(loadingOlder: false, failure: () => failure));
    }
  }

  /// [older] then [newer], each row once.
  List<ThreadMessage> _merge(
    List<ThreadMessage> older,
    List<ThreadMessage> newer,
  ) {
    final seen = <String>{};
    return [
      for (final message in [...older, ...newer])
        if (seen.add(message.ref)) message,
    ];
  }

  @override
  Future<void> close() {
    stop();
    return super.close();
  }
}
