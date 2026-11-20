import 'dart:async';
import 'dart:collection';

import 'package:mobile/core/startup/foreground_refresh.dart';

enum SyncTrigger { resume, reconnect, pushHint, osRefresh }

enum SyncOutcome { refreshed, fresh, deferred, failed }

class SyncPolicy {
  const SyncPolicy({
    required this.ttl,
    this.triggers = const {
      SyncTrigger.resume,
      SyncTrigger.reconnect,
      SyncTrigger.pushHint,
      SyncTrigger.osRefresh,
    },
    this.retryDelay = const Duration(seconds: 30),
    this.maxRetryDelay = const Duration(minutes: 15),
  });

  final Duration ttl;
  final Set<SyncTrigger> triggers;
  final Duration retryDelay;
  final Duration maxRetryDelay;
}

class SmartSync {
  SmartSync({
    required Future<bool> Function() backgroundAllowed,
    DateTime Function()? now,
    this.concurrency = 3,
  }) : _backgroundAllowed = backgroundAllowed,
       _now = now ?? DateTime.now {
    if (concurrency < 1) {
      throw ArgumentError.value(concurrency, 'concurrency');
    }
  }

  final Future<bool> Function() _backgroundAllowed;
  final DateTime Function() _now;
  final int concurrency;

  final _flights = <Object, Future<SyncOutcome>>{};
  final _history = <Object, _SyncHistory>{};
  final _queue = Queue<void Function()>();
  int _running = 0;
  int _scopeRevision = 0;

  void reset() {
    _scopeRevision++;
    _history.clear();
    _flights.clear();
  }

  Future<SyncOutcome> refresh({
    required Object key,
    required SyncPolicy policy,
    required SyncTrigger trigger,
    required bool Function() isCurrent,
    required Future<void> Function() fetch,
    DateTime? fetchedAt,
  }) {
    if (!isCurrent() || !policy.triggers.contains(trigger)) {
      return Future.value(SyncOutcome.deferred);
    }
    Future<SyncOutcome> enqueue() => _enqueue(
      key: key,
      policy: policy,
      isCurrent: isCurrent,
      fetch: fetch,
      fetchedAt: fetchedAt,
    );

    if (trigger != SyncTrigger.osRefresh) return enqueue();
    final revision = _scopeRevision;
    return _whenBackgroundAllowed(() {
      if (revision != _scopeRevision || !isCurrent()) {
        return Future.value(SyncOutcome.deferred);
      }
      return enqueue();
    });
  }

  Future<SyncOutcome> _whenBackgroundAllowed(
    Future<SyncOutcome> Function() enqueue,
  ) async {
    try {
      final allowed = await ForegroundRefresh.run(_backgroundAllowed);
      return allowed == true ? await enqueue() : SyncOutcome.deferred;
    } on Object {
      return SyncOutcome.failed;
    }
  }

  Future<SyncOutcome> _enqueue({
    required Object key,
    required SyncPolicy policy,
    required bool Function() isCurrent,
    required Future<void> Function() fetch,
    required DateTime? fetchedAt,
  }) {
    final existing = _flights[key];
    if (existing != null) return existing;

    final revision = _scopeRevision;
    final result = Completer<SyncOutcome>();
    final flight = result.future;
    _flights[key] = flight;
    _queue.add(
      Zone.current.bindCallback(() {
        _running++;
        unawaited(() async {
          try {
            result.complete(
              await _refresh(
                key: key,
                policy: policy,
                fetchedAt: fetchedAt,
                isCurrent: () => revision == _scopeRevision && isCurrent(),
                fetch: fetch,
              ),
            );
          } on Object {
            result.complete(SyncOutcome.failed);
          } finally {
            if (identical(_flights[key], flight)) {
              unawaited(_flights.remove(key));
            }
            _running--;
            _drain();
          }
        }());
      }),
    );
    _drain();
    return flight;
  }

  void _drain() {
    while (_running < concurrency && _queue.isNotEmpty) {
      _queue.removeFirst()();
    }
  }

  Future<SyncOutcome> _refresh({
    required Object key,
    required SyncPolicy policy,
    required DateTime? fetchedAt,
    required bool Function() isCurrent,
    required Future<void> Function() fetch,
  }) async {
    if (!isCurrent()) return SyncOutcome.deferred;
    final history = _history[key];
    final lastSuccess = history?.lastSuccess;
    final lastRefresh =
        fetchedAt != null &&
            (lastSuccess == null || fetchedAt.isAfter(lastSuccess))
        ? fetchedAt
        : lastSuccess;

    final now = _now();
    if (lastRefresh != null && now.difference(lastRefresh) < policy.ttl) {
      return SyncOutcome.fresh;
    }
    if (history?.retryAfter?.isAfter(now) ?? false) {
      return SyncOutcome.deferred;
    }
    return await ForegroundRefresh.run(() async {
          if (!isCurrent()) return SyncOutcome.deferred;
          try {
            await fetch();
            if (!isCurrent()) return SyncOutcome.deferred;
            _remember(key, _SyncHistory(lastSuccess: _now()));
            return SyncOutcome.refreshed;
          } on Object {
            if (!isCurrent()) return SyncOutcome.deferred;
            final failures = ((history?.failures ?? 0) + 1).clamp(1, 12);
            final delay = policy.retryDelay * (1 << (failures - 1));
            _remember(
              key,
              _SyncHistory(
                lastSuccess: lastSuccess,
                failures: failures,
                retryAfter: _now().add(
                  delay < policy.maxRetryDelay ? delay : policy.maxRetryDelay,
                ),
              ),
            );
            return SyncOutcome.failed;
          }
        }) ??
        SyncOutcome.deferred;
  }

  void _remember(Object key, _SyncHistory history) {
    _history
      ..remove(key)
      ..[key] = history;
    if (_history.length > 128) _history.remove(_history.keys.first);
  }
}

class _SyncHistory {
  const _SyncHistory({this.lastSuccess, this.failures = 0, this.retryAfter});

  final DateTime? lastSuccess;
  final int failures;
  final DateTime? retryAfter;
}
