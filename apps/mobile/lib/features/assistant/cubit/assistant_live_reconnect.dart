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

  /// Disconnect and close: retire the pending reconnect and refuse new ones
  /// until the user starts a call again.
  void _closeReconnect() {
    _reconnectClosed = true;
    _cancelReconnect();
  }

  /// A user start: an older reconnect must never supersede it, even while it
  /// still waits on pending persistence before taking a request version.
  void _openReconnectForUserStart() {
    _cancelReconnect();
    _reconnectClosed = false;
    _reconnectAttempts = 0;
  }

  void _scheduleReconnect() {
    if (_manualDisconnect || _reconnectClosed || state.workspaceId == null) {
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
