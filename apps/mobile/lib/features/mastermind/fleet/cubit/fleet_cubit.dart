import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/replies/reply_idempotency_key.dart';

enum FleetLoadStatus { initial, loading, ready, failed }

/// [queued] waits out the undo window before it is sent; [closed] was refused
/// because the decision or login request already ended.
enum FleetSendStatus { queued, sending, failed, closed }

/// One answer on its way to Web. The key is kept so Retry is the same answer.
class FleetPendingAnswer {
  const FleetPendingAnswer({
    required this.action,
    required this.idempotencyKey,
    required this.status,
    this.optionId,
    this.text,
  });

  final FleetAnswerAction action;
  final String idempotencyKey;
  final FleetSendStatus status;
  final String? optionId;
  final String? text;

  FleetPendingAnswer withStatus(FleetSendStatus status) => FleetPendingAnswer(
    action: action,
    idempotencyKey: idempotencyKey,
    status: status,
    optionId: optionId,
    text: text,
  );
}

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

/// Owns the live fleet snapshot: polls every [interval] while at least one
/// fleet screen is attached and the app is in the foreground, refreshes on
/// demand, and sends owner answers with a durable Idempotency-Key after
/// [undoWindow], during which [undo] drops the answer unsent.
class FleetCubit extends Cubit<FleetViewState> {
  FleetCubit({
    required FleetSource source,
    this.interval = const Duration(seconds: 15),
    this.undoWindow = Duration.zero,
    String Function()? newKey,
    Timer Function(Duration, void Function(Timer))? periodic,
    DateTime Function()? clock,
  }) : _source = source,
       _clock = clock ?? DateTime.now,
       _newKey = newKey ?? newReplyIdempotencyKey,
       _periodic = periodic ?? Timer.periodic,
       super(const FleetViewState());

  final FleetSource _source;
  final Duration interval;
  final Duration undoWindow;
  final DateTime Function() _clock;
  final String Function() _newKey;
  final _undoTimers = <String, (Timer, Completer<void>)>{};
  final Timer Function(Duration, void Function(Timer)) _periodic;
  Timer? _timer;
  int _attached = 0;
  bool _foreground = true;
  Future<void>? _inFlight;
  int _generation = 0;

  void attach() {
    _attached++;
    _schedule();
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
    if (foreground && _attached > 0) unawaited(refresh());
  }

  void _schedule() {
    _timer?.cancel();
    _timer = null;
    if (_attached > 0 && _foreground && !isClosed) {
      _timer = _periodic(interval, (_) {
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
      _dropClosedQueued(snapshot);
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      final failure = FleetException.from(error).failure;
      // Losing access drops held data: it belongs to an owner this session
      // can no longer prove to be.
      if (failure == FleetFailure.forbidden) {
        emit(FleetViewState(status: FleetLoadStatus.failed, failure: failure));
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

  /// Approve, Hold, Reply or "I signed in". A failed send keeps its key so
  /// [retry] cannot record the answer twice.
  Future<void> answer(
    String decisionId,
    FleetAnswerAction action, {
    String? optionId,
    String? text,
  }) {
    final pending = FleetPendingAnswer(
      action: action,
      idempotencyKey: _newKey(),
      status: FleetSendStatus.sending,
      optionId: optionId,
      text: text,
    );
    if (undoWindow <= Duration.zero) return _send(decisionId, pending);
    _cancelQueued(decisionId);
    final generation = _generation;
    final queued = pending.withStatus(FleetSendStatus.queued);
    emit(state.copyWith(pending: {...state.pending, decisionId: queued}));
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
        emit(
          state.copyWith(
            pending: {
              ...state.pending,
              decisionId: pending.withStatus(FleetSendStatus.closed),
            },
          ),
        );
        sent.complete();
        return;
      }
      sent.complete(_send(decisionId, pending));
    });
    _undoTimers[decisionId] = (timer, sent);
    return sent.future;
  }

  /// Stops a queued answer's timer and settles its [answer] future.
  bool _cancelQueued(String decisionId) {
    final queued = _undoTimers.remove(decisionId);
    if (queued == null) return false;
    final (timer, sent) = queued;
    timer.cancel();
    if (!sent.isCompleted) sent.complete();
    return true;
  }

  /// A queued answer to a decision another channel closed meanwhile (gone
  /// from the open list, listed as resolved, or a login request that ended)
  /// is dropped unsent: Web
  /// would refuse it, and its card has already left the Inbox.
  void _dropClosedQueued(FleetSnapshot snapshot) {
    final live = {for (final d in snapshot.decisions) d.id};
    final resolved = {for (final r in snapshot.resolved) r.id};
    final closed = [
      for (final MapEntry(:key, :value) in state.pending.entries)
        if (value.status == FleetSendStatus.queued &&
            (!live.contains(key) ||
                resolved.contains(key) ||
                _loginEnded(snapshot, key)))
          key,
    ];
    if (closed.isEmpty) return;
    closed.forEach(_cancelQueued);
    emit(
      state.copyWith(
        pending: {...state.pending}
          ..removeWhere((id, _) => closed.contains(id)),
      ),
    );
  }

  bool _loginEnded(FleetSnapshot? snapshot, String decisionId) {
    final login = snapshot?.decisions
        .where((d) => d.id == decisionId)
        .firstOrNull
        ?.login;
    return login != null && !login.isOpenAt(_clock().toUtc());
  }

  void _cancelAllQueued() {
    [..._undoTimers.keys].forEach(_cancelQueued);
  }

  /// Drops an answer still inside its undo window; nothing reaches Web.
  void undo(String decisionId) {
    if (!_cancelQueued(decisionId)) return;
    if (state.pending[decisionId]?.status != FleetSendStatus.queued) return;
    emit(state.copyWith(pending: {...state.pending}..remove(decisionId)));
  }

  Future<void> retry(String decisionId) async {
    final pending = state.pending[decisionId];
    if (pending == null || pending.status != FleetSendStatus.failed) return;
    await _send(
      decisionId,
      FleetPendingAnswer(
        action: pending.action,
        idempotencyKey: pending.idempotencyKey,
        status: FleetSendStatus.sending,
        optionId: pending.optionId,
        text: pending.text,
      ),
    );
  }

  Future<void> _send(String decisionId, FleetPendingAnswer pending) async {
    final generation = _generation;
    emit(state.copyWith(pending: {...state.pending, decisionId: pending}));
    try {
      final receipt = await _source.answer(
        decisionId: decisionId,
        action: pending.action,
        idempotencyKey: pending.idempotencyKey,
        optionId: pending.optionId,
        text: pending.text,
      );
      if (isClosed || generation != _generation) return;
      emit(
        state.copyWith(
          snapshot: state.snapshot?.withAnswer(decisionId, receipt),
          pending: {...state.pending}..remove(decisionId),
        ),
      );
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      final closed = FleetException.from(error).failure == FleetFailure.closed;
      emit(
        state.copyWith(
          pending: {
            ...state.pending,
            decisionId: pending.withStatus(
              closed ? FleetSendStatus.closed : FleetSendStatus.failed,
            ),
          },
        ),
      );
      // The snapshot on screen is behind: fetch the state that closed it.
      if (closed) unawaited(refresh());
    }
  }

  /// Logout, account switch or lost access: forget everything held.
  void clear() {
    _generation++;
    _cancelAllQueued();
    if (!isClosed) emit(const FleetViewState());
  }

  @override
  Future<void> close() {
    _timer?.cancel();
    _cancelAllQueued();
    return super.close();
  }
}
