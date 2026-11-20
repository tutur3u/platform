import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/replies/reply_idempotency_key.dart';

enum FleetLoadStatus { initial, loading, ready, failed }

enum FleetSendStatus { sending, failed }

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

  FleetPendingAnswer failed() => FleetPendingAnswer(
    action: action,
    idempotencyKey: idempotencyKey,
    status: FleetSendStatus.failed,
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
/// demand, and sends owner answers with a durable Idempotency-Key.
class FleetCubit extends Cubit<FleetViewState> {
  FleetCubit({
    required FleetSource source,
    this.interval = const Duration(seconds: 15),
    String Function()? newKey,
    Timer Function(Duration, void Function(Timer))? periodic,
  }) : _source = source,
       _newKey = newKey ?? newReplyIdempotencyKey,
       _periodic = periodic ?? Timer.periodic,
       super(const FleetViewState());

  final FleetSource _source;
  final Duration interval;
  final String Function() _newKey;
  final Timer Function(Duration, void Function(Timer)) _periodic;
  Timer? _timer;
  int _attached = 0;
  bool _foreground = true;
  Future<void>? _inFlight;
  int _generation = 0;

  void attach() {
    _attached++;
    _schedule();
    if (_attached == 1) unawaited(refresh());
  }

  void detach() {
    if (_attached > 0) _attached--;
    _schedule();
  }

  void setForeground({required bool foreground}) {
    final resumed = foreground && !_foreground;
    _foreground = foreground;
    _schedule();
    if (resumed && _attached > 0) unawaited(refresh());
  }

  void _schedule() {
    _timer?.cancel();
    _timer = null;
    if (_attached > 0 && _foreground && !isClosed) {
      _timer = _periodic(interval, (_) => unawaited(refresh()));
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

  /// Approve, Hold or Reply. A failed send keeps its key so [retry] cannot
  /// record the answer twice.
  Future<void> answer(
    String decisionId,
    FleetAnswerAction action, {
    String? optionId,
    String? text,
  }) => _send(
    decisionId,
    FleetPendingAnswer(
      action: action,
      idempotencyKey: _newKey(),
      status: FleetSendStatus.sending,
      optionId: optionId,
      text: text,
    ),
  );

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
    } on Object {
      if (isClosed || generation != _generation) return;
      emit(
        state.copyWith(
          pending: {...state.pending, decisionId: pending.failed()},
        ),
      );
    }
  }

  /// Logout, account switch or lost access: forget everything held.
  void clear() {
    _generation++;
    if (!isClosed) emit(const FleetViewState());
  }

  @override
  Future<void> close() {
    _timer?.cancel();
    return super.close();
  }
}
