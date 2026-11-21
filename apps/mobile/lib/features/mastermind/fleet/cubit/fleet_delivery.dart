part of 'fleet_cubit.dart';

/// How one answer travels: each attempt, how its failure settles, when it
/// goes again, and how a snapshot settles answers whose decision closed.
extension _FleetDelivery on FleetCubit {
  /// An unsent answer to a decision the snapshot no longer lists as open
  /// (closed on another channel, withdrawn, or a login request that ended)
  /// stops retrying and settles as closed: Web would refuse it, and its card
  /// has left the Inbox. One already on the wire settles from its response.
  void _settleClosed(FleetSnapshot snapshot) {
    final live = {for (final d in snapshot.decisions) d.id};
    final resolved = {for (final r in snapshot.resolved) r.id: r};
    final now = _now();
    var changed = false;
    final next = <String, FleetPendingAnswer>{};
    for (final MapEntry(:key, :value) in state.pending.entries) {
      if (_expired(value, now)) {
        changed = true;
        continue;
      }
      final waiting =
          value.status == FleetSendStatus.queued ||
          value.status == FleetSendStatus.retrying;
      final ended = !live.contains(key) || _loginEnded(snapshot, key);
      if (waiting && ended) {
        _cancelQueued(key);
        _cancelRetry(key);
        changed = true;
        if (_settledByHistory(value, resolved[key])) continue;
        next[key] = _closed(
          value,
          live.contains(key) ? 'login_closed' : 'decision_closed',
        );
      } else if (value.status == FleetSendStatus.closed &&
          _settledByHistory(value, resolved[key])) {
        changed = true;
      } else {
        next[key] = value;
      }
    }
    if (changed) _setPending(next);
  }

  /// Resolved history already shows where a closed decision went, so an
  /// approve or hold needs no row of its own; and a decision answered on
  /// mobile most likely closed on this very answer, its response lost. Only
  /// written words that may never have arrived stay on screen.
  bool _settledByHistory(
    FleetPendingAnswer entry,
    FleetResolvedDecision? resolved,
  ) =>
      resolved != null &&
      (entry.text == null || resolved.answeredVia == FleetAnswerChannel.mobile);

  Future<void> _attempt(String decisionId) async {
    _cancelRetry(decisionId);
    final entry = state.pending[decisionId];
    if (isClosed || entry?.status != FleetSendStatus.retrying) return;
    final snapshot = state.snapshot;
    // Settled the way a refresh settles it, resolved history included.
    if (snapshot != null &&
        (_decision(snapshot, decisionId) == null ||
            _loginEnded(snapshot, decisionId))) {
      _settleClosed(snapshot);
      return;
    }
    await _send(decisionId, entry!.withStatus(FleetSendStatus.sending));
  }

  Future<void> _send(String decisionId, FleetPendingAnswer pending) async {
    final generation = _generation;
    _put(decisionId, pending);
    try {
      final receipt = await _source.answer(
        decisionId: decisionId,
        action: pending.action,
        idempotencyKey: pending.idempotencyKey,
        optionId: pending.optionId,
        text: pending.text,
      );
      if (isClosed || generation != _generation) return;
      if (state.pending[decisionId]?.idempotencyKey != pending.idempotencyKey) {
        return;
      }
      _emitReceipt(decisionId, receipt);
      _setPending({...state.pending}..remove(decisionId));
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      if (state.pending[decisionId]?.idempotencyKey != pending.idempotencyKey) {
        return;
      }
      final failure = FleetException.from(error);
      switch (failure.failure) {
        case FleetFailure.closed:
          final login =
              _decision(state.snapshot, decisionId)?.kind ==
              FleetDecisionKind.login;
          _put(
            decisionId,
            _closed(
              pending,
              failure.code ?? (login ? 'login_closed' : 'decision_closed'),
            ),
          );
          // The snapshot on screen is behind: fetch the state that closed it.
          unawaited(refresh());
        case FleetFailure.unavailable || FleetFailure.unreadable:
          _retryLater(
            decisionId,
            pending,
            generation,
            fleetRetryDelay(pending.attempts + 1),
          );
        case FleetFailure.challenged
            when pending.challenges < fleetChallengeRetryLimit:
          _retryLater(
            decisionId,
            pending,
            generation,
            fleetChallengeRetryDelay,
            reason: failure.code,
            challenged: true,
          );
        case FleetFailure.forbidden ||
            FleetFailure.challenged ||
            FleetFailure.notPublished ||
            FleetFailure.rejected:
          _put(
            decisionId,
            pending.copyWith(
              status: FleetSendStatus.failed,
              reason: failure.code ?? failure.failure.name,
            ),
          );
      }
    }
  }

  void _retryLater(
    String decisionId,
    FleetPendingAnswer pending,
    int generation,
    Duration delay, {
    String? reason,
    bool challenged = false,
  }) {
    _put(
      decisionId,
      pending.copyWith(
        status: FleetSendStatus.retrying,
        attempts: pending.attempts + 1,
        challenges: challenged ? pending.challenges + 1 : pending.challenges,
        nextAttemptAt: _now().add(delay),
        reason: reason,
        clearReason: reason == null,
      ),
    );
    _retryTimers[decisionId] = _timer(delay, () {
      _retryTimers.remove(decisionId);
      if (generation == _generation) unawaited(_attempt(decisionId));
    });
  }
}
