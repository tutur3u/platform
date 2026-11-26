import 'dart:async';

/// Turns composer edits into throttled typing signals for one conversation.
///
/// The first keystroke sends `true`; while typing continues it is refreshed
/// at most every [refreshAfter], so receivers that expire stale indicators
/// keep showing it. [idleAfter] without an edit, an emptied field, a send,
/// blur or leaving the thread sends `false` once. A conversation room
/// accepts 20 client frames per 10 seconds per socket, so typing stays well
/// inside the budget it shares with presence frames.
class ChatTypingPublisher {
  ChatTypingPublisher({
    required void Function(bool typing) send,
    this.refreshAfter = const Duration(seconds: 3),
    this.idleAfter = const Duration(seconds: 4),
    DateTime Function()? now,
    Timer Function(Duration duration, void Function() callback)? timer,
  }) : _send = send,
       _now = now ?? DateTime.now,
       _timer = timer ?? Timer.new;

  final void Function(bool typing) _send;
  final Duration refreshAfter;
  final Duration idleAfter;
  final DateTime Function() _now;
  final Timer Function(Duration duration, void Function() callback) _timer;

  bool _active = false;
  DateTime? _lastSentAt;
  Timer? _idle;
  bool _disposed = false;

  /// Whether the last signal sent was `true`.
  bool get isTyping => _active;

  /// Reports the composer's current text.
  void onTextChanged(String text) {
    if (_disposed) return;
    if (text.trim().isEmpty) {
      stop();
      return;
    }
    final now = _now();
    final last = _lastSentAt;
    if (!_active || last == null || now.difference(last) >= refreshAfter) {
      _active = true;
      _lastSentAt = now;
      _send(true);
    }
    _idle?.cancel();
    _idle = _timer(idleAfter, stop);
  }

  /// Sends `false` once if typing was announced.
  void stop() {
    _idle?.cancel();
    _idle = null;
    if (!_active) return;
    _active = false;
    _lastSentAt = null;
    if (!_disposed) _send(false);
  }

  /// Stops typing and ignores later edits.
  void dispose() {
    stop();
    _disposed = true;
  }
}
