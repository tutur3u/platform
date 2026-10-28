import 'dart:async';
import 'dart:math';

import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';

/// How one refresh attempt ended, as far as scheduling is concerned.
enum RefreshResult {
  ok,

  /// Network, Worker or parse failure: retry later with backoff.
  failed,

  /// 401/403 or not configured: retrying cannot help, so the scheduler stops
  /// until a screen re-attaches or [MastermindRefreshScheduler.refreshNow].
  stop,
}

/// 60 s while healthy; doubles per consecutive failure up to 15 min.
final class MastermindRefreshPolicy {
  const MastermindRefreshPolicy({
    this.interval = const Duration(seconds: 60),
    this.maxBackoff = const Duration(minutes: 15),
  });

  final Duration interval;
  final Duration maxBackoff;

  Duration delayAfter(int consecutiveFailures) {
    if (consecutiveFailures <= 0) return interval;
    // Clamp the exponent so a long outage cannot overflow the shift.
    final factor = 1 << min(consecutiveFailures, 20);
    final delay = interval * factor;
    return delay > maxBackoff ? maxBackoff : delay;
  }
}

typedef RefreshTimerFactory = Timer Function(Duration delay, void Function());

/// Drives [MastermindSnapshotCubit.refresh] while a Mastermind screen is open.
///
/// Screens call [attach]/[detach] (ref-counted); the app lifecycle calls
/// [setForeground]; connectivity calls [setOnline]. The timer only runs while
/// at least one screen is attached, the app is foregrounded and the device is
/// online. Attempts never overlap: the next one is scheduled when the
/// previous finishes.
final class MastermindRefreshScheduler {
  MastermindRefreshScheduler({
    required Future<RefreshResult> Function() refresh,
    this.policy = const MastermindRefreshPolicy(),
    RefreshTimerFactory? timerFactory,
  }) : _refresh = refresh,
       _timerFactory = timerFactory ?? Timer.new;

  /// Refreshes [cubit] and classifies the outcome from its resulting state.
  factory MastermindRefreshScheduler.forCubit(
    MastermindSnapshotCubit cubit, {
    MastermindRefreshPolicy policy = const MastermindRefreshPolicy(),
    RefreshTimerFactory? timerFactory,
  }) => MastermindRefreshScheduler(
    refresh: () async {
      await cubit.refresh();
      return classifyRefresh(cubit.state);
    },
    policy: policy,
    timerFactory: timerFactory,
  );

  final MastermindRefreshPolicy policy;
  final Future<RefreshResult> Function() _refresh;
  final RefreshTimerFactory _timerFactory;

  Timer? _timer;
  int _attached = 0;
  bool _foreground = true;
  bool _online = true;
  bool _running = false;
  bool _stopped = false;
  bool _disposed = false;
  int _failures = 0;

  int get consecutiveFailures => _failures;

  /// Whether the device last reported a network connection.
  bool get isOnline => _online;
  bool get isScheduled => _timer?.isActive ?? false;

  /// The delay the next scheduled attempt will wait, null when idle.
  Duration? get nextDelay => isScheduled ? policy.delayAfter(_failures) : null;

  /// A Mastermind screen opened. The first attempt is the screen's own
  /// `ensureLoaded`, so this only arms the periodic timer.
  void attach() {
    if (_disposed) return;
    _attached++;
    if (_attached == 1) _stopped = false;
    _reschedule();
  }

  void detach() {
    if (_attached > 0) _attached--;
    _reschedule();
  }

  void setForeground({required bool foreground}) {
    if (_foreground == foreground) return;
    _foreground = foreground;
    _reschedule();
  }

  /// Coming back online fires one attempt now instead of waiting out a backoff.
  void setOnline({required bool online}) {
    if (_online == online) return;
    _online = online;
    if (online && _canRun) {
      _failures = 0;
      unawaited(_tick());
    } else {
      _reschedule();
    }
  }

  /// Pull-to-refresh, app resume or push tap: reset the backoff and run now.
  Future<void> refreshNow() async {
    if (_disposed) return;
    _stopped = false;
    _failures = 0;
    _cancel();
    await _tick(force: true);
  }

  void dispose() {
    _disposed = true;
    _cancel();
  }

  bool get _canRun =>
      !_disposed && !_stopped && _attached > 0 && _foreground && _online;

  void _cancel() {
    _timer?.cancel();
    _timer = null;
  }

  void _reschedule() {
    _cancel();
    if (!_canRun || _running) return;
    _timer = _timerFactory(policy.delayAfter(_failures), () {
      _timer = null;
      unawaited(_tick());
    });
  }

  Future<void> _tick({bool force = false}) async {
    if (_running || (!force && !_canRun)) return;
    _running = true;
    try {
      final result = await _refresh();
      switch (result) {
        case RefreshResult.ok:
          _failures = 0;
        case RefreshResult.failed:
          _failures++;
        case RefreshResult.stop:
          _stopped = true;
      }
    } on Object {
      _failures++;
    } finally {
      _running = false;
    }
    _reschedule();
  }
}

/// A refresh succeeded only if it left accepted, failure-free data behind.
RefreshResult classifyRefresh(MastermindSnapshotState state) => switch (state) {
  MastermindSnapshotReady(refreshFailure: null) => RefreshResult.ok,
  MastermindSnapshotUnavailable(:final kind) when kind.isAccessLost =>
    RefreshResult.stop,
  MastermindSnapshotNotConfigured() => RefreshResult.stop,
  _ => RefreshResult.failed,
};
