import 'dart:async';

import 'package:mobile/data/sources/api_exception.dart';

enum OperationalPhase {
  assistantCreate,
  assistantPreferencePersist,
  assistantReply,
  timezoneRead,
  timezoneWrite,
  timezoneResolve,
}

enum OperationalFailureKind {
  http,
  transport,
  response,
  timeout,
  format,
  state,
  stream,
  unknown,
}

/// Only fixed codes and bounded release metadata can cross the sink boundary.
/// No exception, stack, account, workspace or server payload is retained.
class OperationalErrorEvent {
  OperationalErrorEvent._({
    required this.phase,
    required this.kind,
    required this.status,
    required this.retryAfterBucket,
    required this.appVersion,
    required this.appBuild,
  });

  final OperationalPhase phase;
  final OperationalFailureKind kind;
  final int? status;
  final String retryAfterBucket;
  final String appVersion;
  final String appBuild;

  Map<String, Object> get fields => {
    'schema': 'mobile_operational_v1',
    'phase': phase.name,
    'failure_kind': kind.name,
    if (status != null) 'http_status': status!,
    'retry_after_bucket': retryAfterBucket,
    'app_version': appVersion,
    'app_build': appBuild,
  };

  String get signature =>
      '${phase.name}:${kind.name}:$status:$retryAfterBucket';
}

/// Expired entries are pruned on admission; oldest entries are evicted at cap.
class BoundedFailureDeduplicator {
  BoundedFailureDeduplicator({
    this.capacity = 128,
    this.window = const Duration(minutes: 5),
    DateTime Function()? clock,
  }) : assert(capacity > 0, 'Dedup capacity must be positive'),
       _clock = clock ?? DateTime.now;

  final int capacity;
  final Duration window;
  final DateTime Function() _clock;
  final _entries = <String, DateTime>{};

  bool admit(String signature) {
    final now = _clock();
    _entries.removeWhere((_, at) => now.difference(at) >= window);
    if (_entries.containsKey(signature)) return false;
    if (_entries.length >= capacity) _entries.remove(_entries.keys.first);
    _entries[signature] = now;
    return true;
  }
}

class OperationalErrorReporter {
  OperationalErrorReporter({
    required Future<void> Function(OperationalErrorEvent event) sink,
    String appVersion = 'unknown',
    String appBuild = 'unknown',
    BoundedFailureDeduplicator? deduplicator,
  }) : _sink = sink,
       _version = _releaseValue(appVersion, version: true),
       _build = _releaseValue(appBuild),
       _deduplicator = deduplicator ?? BoundedFailureDeduplicator();

  final Future<void> Function(OperationalErrorEvent event) _sink;
  final String _version;
  final String _build;
  final BoundedFailureDeduplicator _deduplicator;

  void report(OperationalPhase phase, Object error) {
    // Logout/session invalidation is deliberate, not an operational incident.
    if (error is ApiException && error.failureKind == ApiFailureKind.session) {
      return;
    }
    _report(phase, _kind(error), error is ApiException ? error : null);
  }

  void reportStreamFailure() =>
      _report(OperationalPhase.assistantReply, OperationalFailureKind.stream);

  void _report(
    OperationalPhase phase,
    OperationalFailureKind kind, [
    ApiException? error,
  ]) {
    final status = error?.statusCode;
    final event = OperationalErrorEvent._(
      phase: phase,
      kind: kind,
      status: status != null && status >= 100 && status <= 599 ? status : null,
      retryAfterBucket: _retryBucket(error?.retryAfter),
      appVersion: _version,
      appBuild: _build,
    );
    if (!_deduplicator.admit(event.signature)) return;
    // Attach handling before invoking even a synchronously throwing sink.
    // Reporting never delays the state transition or the user's retry.
    unawaited(Future<void>.sync(() => _sink(event)).catchError((Object _) {}));
  }
}

OperationalFailureKind _kind(Object error) => switch (error) {
  ApiException(:final failureKind) => switch (failureKind) {
    ApiFailureKind.http => OperationalFailureKind.http,
    ApiFailureKind.transport => OperationalFailureKind.transport,
    ApiFailureKind.response => OperationalFailureKind.response,
    _ => OperationalFailureKind.unknown,
  },
  TimeoutException() => OperationalFailureKind.timeout,
  FormatException() => OperationalFailureKind.format,
  StateError() => OperationalFailureKind.state,
  _ => OperationalFailureKind.unknown,
};

String _retryBucket(int? seconds) => switch (seconds) {
  null => 'absent',
  < 0 => 'invalid',
  0 => 'zero',
  <= 30 => 'up_to_30s',
  <= 60 => 'up_to_60s',
  <= 300 => 'up_to_5m',
  _ => 'over_5m',
};

String _releaseValue(String value, {bool version = false}) {
  final pattern = version ? r'^\d{1,5}(\.\d{1,5}){1,3}$' : r'^\d{1,10}$';
  return RegExp(pattern).hasMatch(value) ? value : 'unknown';
}
