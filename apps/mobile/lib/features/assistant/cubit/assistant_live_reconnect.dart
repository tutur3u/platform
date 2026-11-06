part of 'assistant_live_cubit.dart';

/// Consecutive automatic reconnects before Live stops and offers Retry. Each
/// attempt mints a fresh provider token, so a dead network must not loop.
const assistantLiveMaxReconnectAttempts = 5;

/// A connection that stays ready this long was healthy, so its drop (such as
/// a routine provider GoAway) starts a fresh reconnect budget. Drops sooner
/// than this count as one flapping streak.
const assistantLiveStableConnection = Duration(seconds: 60);

/// Backoff before automatic reconnect [attempt] (0-based): 0.8 s doubling,
/// capped at 15 s.
Duration assistantLiveReconnectDelay(int attempt) {
  const cap = Duration(seconds: 15);
  final delay = const Duration(milliseconds: 800) * (1 << attempt.clamp(0, 8));
  return delay > cap ? cap : delay;
}

extension _AssistantLiveReconnect on AssistantLiveCubit {
  /// Retires a pending automatic reconnect, so its slot never blocks or
  /// supersedes a later call.
  void _cancelReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
  }

  /// End Call, any disconnect, and close: a new intent that retires pending
  /// and in-flight reconnects, including a socket connect still waiting on
  /// the previous channel's close, and refuses new ones until a user start.
  int _endIntent() {
    _reconnectClosed = true;
    _cancelReconnect();
    _socket.retirePendingConnect();
    return ++_intentEpoch;
  }

  /// A user start: the latest intent, so no older reconnect or preparation
  /// can supersede it, even before it takes a request version.
  int _startIntent() {
    _cancelReconnect();
    _socket.retirePendingConnect();
    _reconnectClosed = false;
    _reconnectAttempts = 0;
    return ++_intentEpoch;
  }

  void _scheduleReconnect() {
    // Only a drop of a session prepared under the current intent may
    // reconnect, and only while admission is open.
    if (_isClosing ||
        isClosed ||
        _manualDisconnect ||
        _reconnectClosed ||
        _sessionEpoch != _intentEpoch ||
        state.workspaceId == null) {
      return;
    }
    // One pending reconnect per request; one left by an older request (a
    // previous call, actor or workspace) is retired rather than trusted.
    if (_reconnectTimer?.isActive ?? false) {
      if (_reconnectTimerRequest == _requestVersion) return;
      _cancelReconnect();
    }
    final readyAt = _readyAt;
    _readyAt = null;
    if (readyAt != null &&
        _now().difference(readyAt) >= assistantLiveStableConnection) {
      _reconnectAttempts = 0;
    }
    if (_reconnectAttempts >= assistantLiveMaxReconnectAttempts) {
      _emitError('live_reconnect_exhausted');
      return;
    }

    final attempt = _reconnectAttempts++;
    final requestVersion = _requestVersion;
    final preparationVersion = _preparationVersion;
    final intentEpoch = _intentEpoch;
    final wsId = state.workspaceId!;
    final chatId = state.chatId;
    final model = state.model;

    _reconnectTimerRequest = requestVersion;
    // Nothing is held while the attempt prepares: a drop during its history
    // binding schedules the next attempt instead of being ignored.
    _reconnectTimer = Timer(assistantLiveReconnectDelay(attempt), () {
      _reconnectTimer = null;
      if (_manualDisconnect ||
          _reconnectClosed ||
          intentEpoch != _intentEpoch ||
          preparationVersion != _preparationVersion ||
          _isStale(requestVersion)) {
        return;
      }
      // prepareSession reads this synchronously to keep the budget.
      _automaticReconnect = true;
      try {
        unawaited(
          prepareSession(
            wsId: wsId,
            chatId: chatId,
            model: model,
            reconnect: true,
          ),
        );
      } finally {
        _automaticReconnect = false;
      }
    });
  }
}
