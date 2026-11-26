import 'dart:async';

/// Turns composer edits into typing frames for one conversation room.
///
/// The first keystroke sends `true`; until typing ends it is refreshed every
/// [refreshAfter] on a timer, so receivers that expire stale indicators keep
/// showing it without a gap even while the typist pauses. [idleAfter]
/// without an edit, an emptied field, a send or blur sends `false`.
///
/// Two frames are never closer than [minGap]: a change wanted sooner waits
/// for the gap and is coalesced with later edits, so typing, clearing and
/// sending in quick cycles costs at most one frame per gap. A room accepts
/// 20 client frames per 10 seconds per socket and rebroadcasts at most 20
/// typing and presence frames per 10 seconds for all members together;
/// [minGap] keeps one typist to 10 frames in that window. [flush] (leaving
/// the room or the foreground) sends a pending `false` at once, since the
/// socket or app is going away. `send` reports whether the frame went out;
/// one that did not (no socket while reconnecting) is not counted, so the
/// next edit tries again.
class ChatTypingPublisher {
  ChatTypingPublisher({
    required bool Function(bool typing) send,
    this.refreshAfter = const Duration(seconds: 3),
    this.idleAfter = const Duration(seconds: 4),
    this.minGap = const Duration(seconds: 1),
    DateTime Function()? now,
    Timer Function(Duration duration, void Function() callback)? timer,
  }) : _send = send,
       _now = now ?? DateTime.now,
       _timer = timer ?? Timer.new;

  final bool Function(bool typing) _send;
  final Duration refreshAfter;
  final Duration idleAfter;
  final Duration minGap;
  final DateTime Function() _now;
  final Timer Function(Duration duration, void Function() callback) _timer;

  /// The state receivers last got.
  bool _sent = false;

  /// The state the composer is in.
  bool _wanted = false;
  DateTime? _lastFrameAt;
  DateTime? _lastOnAt;
  Timer? _idle;
  Timer? _held;
  Timer? _refresh;
  bool _disposed = false;

  /// Whether the last frame sent was `true`.
  bool get isTyping => _sent;

  /// Reports the composer's current text.
  void onTextChanged(String text) {
    if (_disposed) return;
    if (text.trim().isEmpty) {
      stop();
      return;
    }
    _wanted = true;
    _idle?.cancel();
    _idle = _timer(idleAfter, stop);
    _sync();
  }

  /// Ends typing, within the frame gap.
  void stop() {
    if (_disposed) return;
    _idle?.cancel();
    _idle = null;
    _wanted = false;
    _sync();
  }

  /// Ends typing now, ignoring the frame gap.
  void flush() {
    _idle?.cancel();
    _idle = null;
    _held?.cancel();
    _held = null;
    _refresh?.cancel();
    _refresh = null;
    _wanted = false;
    if (_sent && !_disposed) _emit(false);
  }

  /// Flushes and ignores later edits.
  void dispose() {
    flush();
    _disposed = true;
  }

  void _sync() {
    if (_disposed) return;
    final now = _now();
    final lastOn = _lastOnAt;
    final due =
        _wanted != _sent ||
        (_wanted && (lastOn == null || now.difference(lastOn) >= refreshAfter));
    if (!due) {
      _held?.cancel();
      _held = null;
      return;
    }
    final last = _lastFrameAt;
    final wait = last == null ? Duration.zero : minGap - now.difference(last);
    if (wait <= Duration.zero) {
      _held?.cancel();
      _held = null;
      _emit(_wanted);
      return;
    }
    _held ??= _timer(wait, () {
      _held = null;
      _sync();
    });
  }

  void _emit(bool on) {
    _refresh?.cancel();
    _refresh = null;
    if (!_send(on)) return;
    final now = _now();
    _sent = on;
    _lastFrameAt = now;
    if (!on) return;
    _lastOnAt = now;
    _refresh = _timer(refreshAfter, () {
      _refresh = null;
      _sync();
    });
  }
}
