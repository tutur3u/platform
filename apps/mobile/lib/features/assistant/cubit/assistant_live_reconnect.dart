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
  void _scheduleReconnect() {
    if (_manualDisconnect || _reconnectScheduled || state.workspaceId == null) {
      return;
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
    _reconnectScheduled = true;
    final requestVersion = _requestVersion;
    final wsId = state.workspaceId!;
    final chatId = state.chatId;
    final model = state.model;

    unawaited(
      Future<void>.delayed(assistantLiveReconnectDelay(attempt), () async {
        try {
          if (_manualDisconnect || _isStale(requestVersion)) return;
          // prepareSession reads this synchronously to keep the budget.
          _automaticReconnect = true;
          final preparing = prepareSession(
            wsId: wsId,
            chatId: chatId,
            model: model,
            reconnect: true,
          );
          _automaticReconnect = false;
          await preparing;
        } finally {
          _automaticReconnect = false;
          _reconnectScheduled = false;
        }
      }),
    );
  }
}
