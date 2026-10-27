import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_refresh_scheduler.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import '../../../helpers/mastermind_hub_harness.dart';
import '../../../helpers/mastermind_snapshot_builder.dart';

final class _FakeTimer implements Timer {
  _FakeTimer(this.delay, this._callback);
  final Duration delay;
  final void Function() _callback;
  bool cancelled = false;
  bool fired = false;

  @override
  bool get isActive => !cancelled && !fired;
  @override
  int get tick => fired ? 1 : 0;
  @override
  void cancel() => cancelled = true;

  void fire() {
    fired = true;
    _callback();
  }
}

final class _Harness {
  _Harness([List<RefreshResult> results = const []])
    : results = List.of(results) {
    scheduler = MastermindRefreshScheduler(
      refresh: () async {
        calls++;
        final gate = gates.isEmpty ? null : gates.removeAt(0);
        if (gate != null) await gate.future;
        return this.results.isEmpty
            ? RefreshResult.ok
            : this.results.removeAt(0);
      },
      timerFactory: (delay, callback) {
        final timer = _FakeTimer(delay, callback);
        timers.add(timer);
        return timer;
      },
    );
  }

  late final MastermindRefreshScheduler scheduler;
  final List<RefreshResult> results;
  final gates = <Completer<void>>[];
  final timers = <_FakeTimer>[];
  int calls = 0;

  _FakeTimer get active => timers.lastWhere((t) => t.isActive);
  bool get hasActive => timers.any((t) => t.isActive);

  /// Fires the armed timer and lets the refresh and rescheduling settle.
  Future<void> fire() async {
    active.fire();
    await pumpEventQueue();
  }
}

void main() {
  test('backoff schedule: 60 s doubling to a 15 min cap', () {
    const policy = MastermindRefreshPolicy();
    expect(
      [for (var i = 0; i <= 6; i++) policy.delayAfter(i).inSeconds],
      [60, 120, 240, 480, 900, 900, 900],
    );
    expect(policy.delayAfter(-3), const Duration(seconds: 60));
    // A long outage must not overflow the shift.
    expect(policy.delayAfter(10000), const Duration(minutes: 15));
  });

  test('attach arms the 60 s timer and does not refresh by itself', () {
    final h = _Harness()..scheduler.attach();
    expect(h.active.delay, const Duration(seconds: 60));
    expect(h.scheduler.nextDelay, const Duration(seconds: 60));
    expect(h.calls, 0);
  });

  test('failures back off and a success resets to 60 s', () async {
    final h = _Harness([
      RefreshResult.failed,
      RefreshResult.failed,
      RefreshResult.failed,
      RefreshResult.ok,
    ])..scheduler.attach();
    final delays = <int>[h.active.delay.inSeconds];
    for (var i = 0; i < 4; i++) {
      await h.fire();
      delays.add(h.active.delay.inSeconds);
    }
    expect(delays, [60, 120, 240, 480, 60]);
    expect(h.scheduler.consecutiveFailures, 0);
    expect(h.calls, 4);
  });

  test('attempts never overlap', () async {
    final gate = Completer<void>();
    final h = _Harness()
      ..gates.add(gate)
      ..scheduler.attach();
    final first = h.active..fire();
    await pumpEventQueue();
    expect(h.calls, 1);
    // No next timer until the in-flight refresh finishes.
    expect(h.hasActive, isFalse);
    gate.complete();
    await pumpEventQueue();
    expect(h.active, isNot(same(first)));
  });

  test('screens are reference counted', () {
    final h = _Harness()
      ..scheduler.attach()
      ..scheduler.attach();
    h.scheduler.detach();
    expect(h.hasActive, isTrue);
    h.scheduler.detach();
    expect(h.hasActive, isFalse);
    // An unbalanced detach is harmless.
    h.scheduler.detach();
    h.scheduler.attach();
    expect(h.hasActive, isTrue);
  });

  test('the timer pauses in the background and resumes in the foreground', () {
    final h = _Harness()..scheduler.attach();
    h.scheduler.setForeground(foreground: false);
    expect(h.hasActive, isFalse);
    h.scheduler.setForeground(foreground: true);
    expect(h.active.delay, const Duration(seconds: 60));
  });

  test('offline skips attempts; reconnecting fires one immediately', () async {
    final h = _Harness([RefreshResult.failed, RefreshResult.failed])
      ..scheduler.attach();
    await h.fire();
    await h.fire();
    expect(h.scheduler.consecutiveFailures, 2);
    h.scheduler.setOnline(online: false);
    expect(h.hasActive, isFalse);
    expect(h.calls, 2);
    h.scheduler.setOnline(online: true);
    await pumpEventQueue();
    expect(h.calls, 3);
    expect(h.scheduler.consecutiveFailures, 0);
    expect(h.active.delay, const Duration(seconds: 60));
  });

  test('a stop result ends scheduling until a screen re-attaches', () async {
    final h = _Harness([RefreshResult.stop])..scheduler.attach();
    await h.fire();
    expect(h.hasActive, isFalse);
    h.scheduler.detach();
    h.scheduler.attach();
    expect(h.hasActive, isTrue);
  });

  test('refreshNow resets the backoff and runs immediately', () async {
    final h = _Harness([RefreshResult.failed, RefreshResult.failed])
      ..scheduler.attach();
    await h.fire();
    await h.fire();
    expect(h.active.delay, const Duration(seconds: 240));
    await h.scheduler.refreshNow();
    expect(h.calls, 3);
    expect(h.scheduler.consecutiveFailures, 0);
    expect(h.active.delay, const Duration(seconds: 60));
  });

  test('a throwing refresh counts as a failure', () async {
    final scheduler = MastermindRefreshScheduler(
      refresh: () async => throw StateError('boom'),
      timerFactory: _FakeTimer.new,
    )..attach();
    await scheduler.refreshNow();
    expect(scheduler.consecutiveFailures, 1);
  });

  test('dispose cancels and stays inert', () {
    final h = _Harness()..scheduler.attach();
    h.scheduler.dispose();
    expect(h.hasActive, isFalse);
    h.scheduler.attach();
    expect(h.hasActive, isFalse);
  });

  group('classifyRefresh', () {
    final snapshot =
        (parseMastermindSnapshot(MastermindSnapshotBuilder.defaults().bytes())
                as ParseAccepted)
            .snapshot;
    MastermindSnapshotReady ready({SnapshotRefreshFailure? failure}) =>
        MastermindSnapshotReady(
          snapshot: snapshot,
          digest: hubDigest,
          origin: SnapshotOrigin.live,
          receivedAt: DateTime.utc(2026),
          refreshFailure: failure,
        );

    test('maps cubit states to scheduling outcomes', () {
      expect(classifyRefresh(ready()), RefreshResult.ok);
      expect(
        classifyRefresh(
          ready(
            failure: const UnavailableRefresh(
              SnapshotUnavailableKind.unavailable,
            ),
          ),
        ),
        RefreshResult.failed,
      );
      expect(
        classifyRefresh(
          const MastermindSnapshotUnavailable(
            SnapshotUnavailableKind.forbidden,
          ),
        ),
        RefreshResult.stop,
      );
      expect(
        classifyRefresh(
          const MastermindSnapshotUnavailable(
            SnapshotUnavailableKind.unauthorized,
          ),
        ),
        RefreshResult.stop,
      );
      expect(
        classifyRefresh(const MastermindSnapshotNotConfigured()),
        RefreshResult.stop,
      );
      expect(
        classifyRefresh(
          const MastermindSnapshotUnavailable(
            SnapshotUnavailableKind.unavailable,
          ),
        ),
        RefreshResult.failed,
      );
      expect(
        classifyRefresh(
          const MastermindSnapshotRejected(RejectionReason.schemaViolation),
        ),
        RefreshResult.failed,
      );
    });
  });
}
