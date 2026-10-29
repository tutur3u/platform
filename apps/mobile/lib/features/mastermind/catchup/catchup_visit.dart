import 'dart:async';

import 'package:shared_preferences/shared_preferences.dart';

/// Per-device marker of the last time the Catch-up section was rendered.
abstract interface class CatchupVisitStore {
  Future<DateTime?> read();
  Future<void> write(DateTime at);
}

const _visitKey = 'mastermind-catchup-last-visit';

final class SharedPrefsCatchupVisitStore implements CatchupVisitStore {
  const SharedPrefsCatchupVisitStore();

  @override
  Future<DateTime?> read() async {
    final saved = (await SharedPreferences.getInstance()).getString(_visitKey);
    return saved == null ? null : DateTime.tryParse(saved)?.toUtc();
  }

  @override
  Future<void> write(DateTime at) async {
    await (await SharedPreferences.getInstance()).setString(
      _visitKey,
      at.toUtc().toIso8601String(),
    );
  }
}

final class MemoryCatchupVisitStore implements CatchupVisitStore {
  MemoryCatchupVisitStore([this.value]);
  DateTime? value;

  @override
  Future<DateTime?> read() async => value;

  @override
  Future<void> write(DateTime at) async => value = at;
}

/// The span the digest covers.
///
/// [start] is where the visible window begins. [newSince] is the previous
/// visit: rows at or after it are "new". It is null on the first visit, when
/// nothing is new, only the last 24 hours.
final class CatchupWindow {
  const CatchupWindow({required this.start, this.newSince});
  final DateTime start;
  final DateTime? newSince;

  bool get firstVisit => newSince == null;
}

/// Decides the window and records the render.
///
/// A visit is one stretch of use: it ends after [idleGap] without a render,
/// so switching tabs or a quick return keeps the same window while coming back
/// the next morning starts a new one from the last render before the gap.
/// The marker is written at most once a minute.
final class CatchupVisitTracker {
  CatchupVisitTracker({
    CatchupVisitStore? store,
    this.idleGap = const Duration(minutes: 30),
    this.firstVisitSpan = const Duration(hours: 24),
    this.maxLookback = const Duration(days: 7),
  }) : _store = store ?? const SharedPrefsCatchupVisitStore();

  final CatchupVisitStore _store;
  final Duration idleGap;
  final Duration firstVisitSpan;
  final Duration maxLookback;

  bool _loaded = false;
  DateTime? _lastRender;
  DateTime? _lastWrite;
  CatchupWindow? _window;

  bool get isLoaded => _loaded;

  Future<void> load() async {
    if (_loaded) return;
    try {
      _lastRender = await _store.read();
    } on Object {
      /* No marker reads as a first visit. */
    }
    _loaded = true;
  }

  /// The window at [now], recording this render. Needs [load] first.
  CatchupWindow windowAt(DateTime now) {
    final last = _lastRender;
    var window = _window;
    if (window == null || last == null || now.difference(last) > idleGap) {
      window = _window = last == null
          ? CatchupWindow(start: now.subtract(firstVisitSpan))
          : CatchupWindow(
              start: _clamp(last, now),
              newSince: _clamp(last, now),
            );
    }
    _lastRender = now;
    final written = _lastWrite;
    if (written == null ||
        now.difference(written) >= const Duration(minutes: 1)) {
      _lastWrite = now;
      unawaited(_store.write(now).catchError((Object _) {}));
    }
    return window;
  }

  // Never in the future (clock change) or further back than the lookback.
  DateTime _clamp(DateTime visit, DateTime now) {
    final oldest = now.subtract(maxLookback);
    if (visit.isAfter(now)) return now;
    return visit.isBefore(oldest) ? oldest : visit;
  }
}
