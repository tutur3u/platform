import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_pending_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_outbox_store.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/replies/reply_idempotency_key.dart';

export 'package:mobile/features/mastermind/fleet/cubit/fleet_pending_answer.dart';

part 'fleet_delivery.dart';

enum FleetLoadStatus { initial, loading, ready, failed }

class FleetViewState {
  const FleetViewState({
    this.status = FleetLoadStatus.initial,
    this.snapshot,
    this.failure,
    this.refreshing = false,
    this.pending = const {},
  });

  final FleetLoadStatus status;
  final FleetSnapshot? snapshot;

  /// The latest failure. With a [snapshot] held it only marks the last
  /// refresh as failed; the held data stays on screen.
  final FleetFailure? failure;
  final bool refreshing;
  final Map<String, FleetPendingAnswer> pending;

  FleetViewState copyWith({
    FleetLoadStatus? status,
    FleetSnapshot? snapshot,
    FleetFailure? failure,
    bool clearFailure = false,
    bool? refreshing,
    Map<String, FleetPendingAnswer>? pending,
  }) => FleetViewState(
    status: status ?? this.status,
    snapshot: snapshot ?? this.snapshot,
    failure: clearFailure ? null : failure ?? this.failure,
    refreshing: refreshing ?? this.refreshing,
    pending: pending ?? this.pending,
  );
}

/// Owns the live fleet snapshot and the owner's answers to it.
///
/// Polls every [interval] while a fleet screen is attached and the app is in
/// the foreground. Answers wait [undoWindow], then go out with one durable
/// Idempotency-Key that every retry reuses. A network error, 5xx or 429
/// retries on its own ([fleetRetryDelay]), again at once on resume or when
/// the device comes back online, and across restarts through the outbox
/// store, for as long as the decision stays open. A 409 settles the answer
/// as closed and any other 4xx as failed with Web's reason; neither is
/// resent.
class FleetCubit extends Cubit<FleetViewState> {
  FleetCubit({
    required FleetSource source,
    FleetOutboxStore? outbox,
    this.interval = const Duration(seconds: 15),
    this.undoWindow = Duration.zero,
    String Function()? newKey,
    Timer Function(Duration, void Function(Timer))? periodic,
    Timer Function(Duration, void Function())? timer,
    DateTime Function()? clock,
  }) : _source = source,
       _outbox = outbox ?? MemoryFleetOutboxStore(),
       _clock = clock ?? DateTime.now,
       _newKey = newKey ?? newReplyIdempotencyKey,
       _periodic = periodic ?? Timer.periodic,
       _timer = timer ?? Timer.new,
       super(const FleetViewState());

  /// A settled answer (closed or failed) stays this long to explain itself.
  static const settledRetention = Duration(hours: 24);

  final FleetSource _source;
  final FleetOutboxStore _outbox;
  final Duration interval;
  final Duration undoWindow;
  final DateTime Function() _clock;
  final String Function() _newKey;
  final _undoTimers = <String, (Timer, Completer<void>)>{};
  final _retryTimers = <String, Timer>{};
  final Timer Function(Duration, void Function(Timer)) _periodic;
  final Timer Function(Duration, void Function()) _timer;
  Timer? _poll;
  int _attached = 0;
  bool _foreground = true;
  Future<void>? _inFlight;
  Future<void>? _restored;
  int _generation = 0;

  DateTime _now() => _clock().toUtc();

  void attach() {
    _attached++;
    _schedule();
    unawaited(restore());
    if (_attached == 1 && _foreground) unawaited(refresh());
  }

  void detach() {
    if (_attached > 0) _attached--;
    _schedule();
  }

  void setForeground({required bool foreground}) {
    if (_foreground == foreground) return;
    _foreground = foreground;
    _schedule();
    if (!foreground) return;
    retryNow();
    if (_attached > 0) unawaited(refresh());
  }

  void _schedule() {
    _poll?.cancel();
    _poll = null;
    if (_attached > 0 && _foreground && !isClosed) {
      _poll = _periodic(interval, (_) {
        ForegroundRefresh.request(this, () {
          if (_attached > 0 && _foreground && !isClosed) unawaited(refresh());
        });
      });
    }
  }

  /// Fetches now; concurrent calls share one request.
  Future<void> refresh() => _inFlight ??= _fetch().whenComplete(() {
    _inFlight = null;
  });

  Future<void> _fetch() async {
    final generation = _generation;
    if (state.snapshot == null) {
      emit(state.copyWith(status: FleetLoadStatus.loading));
    } else {
      emit(state.copyWith(refreshing: true));
    }
    try {
      final snapshot = await _source.fetch();
      if (isClosed || generation != _generation) return;
      emit(
        state.copyWith(
          status: FleetLoadStatus.ready,
          snapshot: snapshot,
          clearFailure: true,
          refreshing: false,
        ),
      );
      _settleClosed(snapshot);
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      final failure = FleetException.from(error).failure;
      // Losing access drops the held snapshot: it belongs to an owner this
      // session can no longer prove to be. Unsent answers stay, here and on
      // disk, until the runtime clears the account; a lasting loss settles
      // them as failed on their next attempt.
      if (failure == FleetFailure.forbidden) {
        emit(
          FleetViewState(
            status: FleetLoadStatus.failed,
            failure: failure,
            pending: state.pending,
          ),
        );
        return;
      }
      emit(
        state.copyWith(
          status: state.snapshot == null
              ? FleetLoadStatus.failed
              : FleetLoadStatus.ready,
          failure: failure,
          refreshing: false,
        ),
      );
    }
  }

  /// Loads answers a previous run left unsent, once per signed-in session,
  /// and sends the outstanding ones at once.
  Future<void> restore() => _restored ??= _restore();

  Future<void> _restore() async {
    final generation = _generation;
    final Map<String, FleetPendingAnswer> stored;
    try {
      stored = await _outbox.read();
    } on Object {
      _restored = null;
      return;
    }
    // Read while signed out: try again on the next attach or answer.
    if (!_outbox.bound) _restored = null;
    if (isClosed || generation != _generation || stored.isEmpty) return;
    final now = _now();
    final restored = {
      for (final MapEntry(:key, :value) in stored.entries)
        if (!state.pending.containsKey(key) && !_expired(value, now))
          key: value.outstanding
              ? value.copyWith(status: FleetSendStatus.retrying)
              : value,
    };
    if (restored.isEmpty) return;
    _setPending({...restored, ...state.pending});
    // Read the snapshot first, so answers whose decision closed meanwhile
    // settle from resolved history instead of being resent into a 409.
    await refresh();
    if (isClosed || generation != _generation) return;
    if (state.snapshot case final snapshot?) _settleClosed(snapshot);
    for (final key in restored.keys) {
      if (state.pending[key]?.status == FleetSendStatus.retrying) {
        unawaited(_attempt(key));
      }
    }
  }

  bool _expired(FleetPendingAnswer entry, DateTime now) =>
      !entry.outstanding && now.difference(entry.createdAt) > settledRetention;

  void _setPending(Map<String, FleetPendingAnswer> pending) {
    emit(state.copyWith(pending: pending));
    // A failed write only costs the restart; the answer keeps retrying here.
    unawaited(_outbox.write(pending).catchError((Object _) {}));
  }

  void _emitReceipt(String decisionId, FleetAnswerReceipt receipt) => emit(
    state.copyWith(snapshot: state.snapshot?.withAnswer(decisionId, receipt)),
  );

  void _put(String decisionId, FleetPendingAnswer entry) =>
      _setPending({...state.pending, decisionId: entry});

  /// Approve, Hold, Reply or "I signed in".
  Future<void> answer(
    String decisionId,
    FleetAnswerAction action, {
    String? optionId,
    String? text,
  }) {
    // Binds the outbox to this account before the first write.
    unawaited(restore());
    final pending = FleetPendingAnswer(
      action: action,
      idempotencyKey: _newKey(),
      status: FleetSendStatus.sending,
      createdAt: _now(),
      optionId: optionId,
      text: text,
      title: _decision(state.snapshot, decisionId)?.title,
    );
    _cancelRetry(decisionId);
    if (undoWindow <= Duration.zero) return _send(decisionId, pending);
    _cancelQueued(decisionId);
    final generation = _generation;
    final queued = pending.withStatus(FleetSendStatus.queued);
    _put(decisionId, queued);
    final sent = Completer<void>();
    final timer = Timer(undoWindow, () {
      _undoTimers.remove(decisionId);
      if (isClosed ||
          generation != _generation ||
          state.pending[decisionId] != queued) {
        sent.complete();
        return;
      }
      // A login request that ended while the answer waited would only be
      // refused; settle it as closed without sending.
      if (_loginEnded(state.snapshot, decisionId)) {
        _put(decisionId, _closed(pending, 'login_closed'));
        sent.complete();
        return;
      }
      sent.complete(_send(decisionId, pending));
    });
    _undoTimers[decisionId] = (timer, sent);
    return sent.future;
  }

  FleetDecision? _decision(FleetSnapshot? snapshot, String decisionId) =>
      snapshot?.decisions.where((d) => d.id == decisionId).firstOrNull;

  FleetPendingAnswer _closed(FleetPendingAnswer entry, String reason) =>
      entry.copyWith(status: FleetSendStatus.closed, reason: reason);

  /// Stops a queued answer's timer and settles its [answer] future.
  bool _cancelQueued(String decisionId) {
    final queued = _undoTimers.remove(decisionId);
    if (queued == null) return false;
    final (timer, sent) = queued;
    timer.cancel();
    if (!sent.isCompleted) sent.complete();
    return true;
  }

  void _cancelRetry(String decisionId) =>
      _retryTimers.remove(decisionId)?.cancel();

  bool _loginEnded(FleetSnapshot? snapshot, String decisionId) {
    final login = _decision(snapshot, decisionId)?.login;
    return login != null && !login.isOpenAt(_now());
  }

  void _cancelAllTimers() {
    [..._undoTimers.keys].forEach(_cancelQueued);
    for (final timer in _retryTimers.values) {
      timer.cancel();
    }
    _retryTimers.clear();
  }

  /// Drops an answer still inside its undo window; nothing reaches Web.
  void undo(String decisionId) {
    if (!_cancelQueued(decisionId)) return;
    if (state.pending[decisionId]?.status != FleetSendStatus.queued) return;
    _setPending({...state.pending}..remove(decisionId));
  }

  /// Forgets a closed or failed answer once the owner has seen it.
  void dismiss(String decisionId) {
    final entry = state.pending[decisionId];
    if (entry == null || entry.outstanding) return;
    _setPending({...state.pending}..remove(decisionId));
  }

  /// Sends a retrying answer now instead of at its scheduled time.
  Future<void> retry(String decisionId) async {
    if (state.pending[decisionId]?.status != FleetSendStatus.retrying) return;
    await _attempt(decisionId);
  }

  /// Every retrying answer goes now: the app resumed or came back online.
  void retryNow() {
    for (final MapEntry(:key, :value) in state.pending.entries) {
      if (value.status == FleetSendStatus.retrying) unawaited(_attempt(key));
    }
  }

  /// Logout, account switch or lost access: forget everything held and
  /// erase the outbox file of the account it was read for. The next
  /// account's outbox loads on its first [restore].
  void clear() {
    _generation++;
    _restored = null;
    _cancelAllTimers();
    // Queued behind any write still in flight, so nothing recreates the
    // departing account's file after this erase.
    unawaited(_outbox.clear().catchError((Object _) {}));
    if (!isClosed) emit(const FleetViewState());
  }

  @override
  Future<void> close() {
    _poll?.cancel();
    _cancelAllTimers();
    return super.close();
  }
}
