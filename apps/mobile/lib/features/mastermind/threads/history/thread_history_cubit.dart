import 'dart:math' as math;

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_client.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

enum ThreadHistoryPhase {
  loading,
  ready,
  failed,

  /// The app lock is showing: everything read was dropped from memory.
  hidden,
}

final class ThreadHistoryState extends Equatable {
  const ThreadHistoryState({
    this.phase = ThreadHistoryPhase.loading,
    this.thread,
    this.messages = const [],
    this.nextBefore,
    this.loadingEarlier = false,
    this.problem,
    this.retryAt,
    this.updated = false,
  });

  final ThreadHistoryPhase phase;
  final ThreadIndexEntry? thread;

  /// Oldest first; newest renders at the bottom.
  final List<ThreadMessage> messages;
  final String? nextBefore;
  final bool loadingEarlier;

  /// With [ThreadHistoryPhase.failed], why nothing shows. With
  /// [ThreadHistoryPhase.ready], why the last "Load earlier" failed.
  final ThreadsProblem? problem;

  /// When a 429 says the next read may go.
  final DateTime? retryAt;

  /// The history was replaced while open (410) and has been reloaded.
  final bool updated;

  bool get hasEarlier => nextBefore != null;

  @override
  List<Object?> get props => [
    phase,
    thread,
    messages,
    nextBefore,
    loadingEarlier,
    problem,
    retryAt,
    updated,
  ];
}

/// Read-only history for one thread, memory only (D §3.2, §3.10).
///
/// Every page is pinned to the index's `history_digest`. A 410 means that
/// history was replaced: the index is read again once, the new digest pinned,
/// and the newest page reloaded. Results that arrive after [hide] or [close]
/// are dropped, so a locked screen never repopulates.
class ThreadHistoryCubit extends Cubit<ThreadHistoryState> {
  ThreadHistoryCubit({
    required this.source,
    required this.threadRef,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now,
       super(const ThreadHistoryState());

  /// D §1.3: 30 messages per page unless the hub allows fewer.
  static const pageSize = 30;

  final ThreadHistorySource source;
  final String threadRef;
  final DateTime Function() _clock;
  int _generation = 0;
  int _limit = pageSize;

  bool _current(int generation) => !isClosed && generation == _generation;

  /// Loads the thread from scratch: capabilities, index, newest page.
  Future<void> open() async {
    if (isClosed) return;
    final generation = ++_generation;
    emit(const ThreadHistoryState());
    if (!threadRefPattern.hasMatch(threadRef)) {
      return _fail(generation, ThreadsProblem.notAvailable);
    }
    final caps = await source.capabilities();
    if (!_current(generation)) return;
    switch (caps) {
      case ThreadsFetchFailed(:final problem, :final retryAfter):
        return _fail(generation, problem, retryAfter);
      case ThreadsFetchOk(:final value) when !value.read:
        return _fail(generation, ThreadsProblem.notAvailable);
      case ThreadsFetchOk(:final value):
        _limit = math.min(pageSize, value.pageMax);
    }
    await _loadNewest(generation, missing: ThreadsProblem.notAvailable);
  }

  /// Reads the index, pins the thread's digest and loads its newest page.
  /// [missing] is what a thread absent from the index means here.
  Future<void> _loadNewest(
    int generation, {
    required ThreadsProblem missing,
    bool updated = false,
  }) async {
    final index = await source.index();
    if (!_current(generation)) return;
    final List<ThreadIndexEntry> entries;
    switch (index) {
      case ThreadsFetchFailed(:final problem, :final retryAfter):
        return _fail(generation, problem, retryAfter);
      case ThreadsFetchOk(:final value):
        entries = value;
    }
    final thread = entries.where((t) => t.ref == threadRef).firstOrNull;
    if (thread == null) return _fail(generation, missing);
    if (thread.history != ThreadHistoryTier.redacted) {
      return _fail(generation, ThreadsProblem.notAvailable);
    }
    final digest = thread.digest;
    if (digest == null) {
      // Readable, but nothing published yet.
      emit(
        ThreadHistoryState(
          phase: ThreadHistoryPhase.ready,
          thread: thread,
          updated: updated,
        ),
      );
      return;
    }
    final page = await source.messages(
      ref: threadRef,
      digest: digest,
      limit: _limit,
    );
    if (!_current(generation)) return;
    switch (page) {
      case ThreadsFetchFailed(problem: ThreadsProblem.digestGone):
        // Replaced again between the index and the page: stop, don't loop.
        return _fail(generation, ThreadsProblem.unavailable);
      case ThreadsFetchFailed(:final problem, :final retryAfter):
        return _fail(generation, problem, retryAfter);
      case ThreadsFetchOk(:final value):
        emit(
          ThreadHistoryState(
            phase: ThreadHistoryPhase.ready,
            thread: thread,
            messages: _merge(const [], value.messages),
            nextBefore: value.nextBefore,
            updated: updated,
          ),
        );
    }
  }

  /// Pages backwards from the oldest message shown, on the pinned digest.
  Future<void> loadEarlier() async {
    final current = state;
    final before = current.nextBefore;
    final digest = current.thread?.digest;
    if (isClosed ||
        current.phase != ThreadHistoryPhase.ready ||
        current.loadingEarlier ||
        before == null ||
        digest == null) {
      return;
    }
    final generation = _generation;
    emit(_copy(current, loadingEarlier: true));
    final page = await source.messages(
      ref: threadRef,
      digest: digest,
      limit: _limit,
      before: before,
    );
    if (!_current(generation)) return;
    switch (page) {
      case ThreadsFetchFailed(problem: ThreadsProblem.digestGone):
        // The pinned history is gone: start over on the new one.
        final next = ++_generation;
        emit(const ThreadHistoryState());
        await _loadNewest(next, missing: ThreadsProblem.gone, updated: true);
      case ThreadsFetchFailed(problem: ThreadsProblem.accessLost):
        _fail(generation, ThreadsProblem.accessLost);
      case ThreadsFetchFailed(:final problem, :final retryAfter):
        // Keep what is on screen; say why nothing older came.
        emit(_copy(current, problem: problem, retryAt: _retryAt(retryAfter)));
      case ThreadsFetchOk(:final value):
        final merged = _merge(value.messages, current.messages);
        emit(
          _copy(
            current,
            messages: merged,
            // The phone keeps no more than the hub publishes per thread.
            nextBefore: merged.length >= threadHistoryMaxMessages
                ? null
                : value.nextBefore,
          ),
        );
    }
  }

  /// The app lock is up: drop everything held and ignore in-flight reads.
  void hide() {
    if (isClosed) return;
    ++_generation;
    emit(const ThreadHistoryState(phase: ThreadHistoryPhase.hidden));
  }

  void _fail(int generation, ThreadsProblem problem, [Duration? retryAfter]) {
    if (!_current(generation)) return;
    emit(
      ThreadHistoryState(
        phase: ThreadHistoryPhase.failed,
        problem: problem,
        retryAt: _retryAt(retryAfter),
      ),
    );
  }

  DateTime? _retryAt(Duration? retryAfter) =>
      retryAfter == null ? null : _clock().add(retryAfter);

  ThreadHistoryState _copy(
    ThreadHistoryState from, {
    List<ThreadMessage>? messages,
    String? nextBefore,
    bool loadingEarlier = false,
    ThreadsProblem? problem,
    DateTime? retryAt,
  }) => ThreadHistoryState(
    phase: from.phase,
    thread: from.thread,
    messages: messages ?? from.messages,
    nextBefore: messages == null ? from.nextBefore : nextBefore,
    loadingEarlier: loadingEarlier,
    problem: problem,
    retryAt: retryAt,
    updated: from.updated,
  );

  /// [older] then [newer], each message once, capped to the newest
  /// [threadHistoryMaxMessages].
  static List<ThreadMessage> _merge(
    List<ThreadMessage> older,
    List<ThreadMessage> newer,
  ) {
    final seen = <String>{};
    final merged = [
      for (final message in [...older, ...newer])
        if (seen.add(message.ref)) message,
    ];
    final start = math.max(0, merged.length - threadHistoryMaxMessages);
    return List.unmodifiable(merged.sublist(start));
  }

  @override
  Future<void> close() {
    ++_generation;
    return super.close();
  }
}
