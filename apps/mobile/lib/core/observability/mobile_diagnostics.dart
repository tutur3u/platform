import 'dart:async';
import 'dart:collection';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

enum MobileDiagnosticSignal {
  firstFrame,
  slowFirstFrame,
  dartError,
  credentialReadTimeout,
}

class MobileNetworkEvent {
  const MobileNetworkEvent._(
    this.method,
    this.host,
    this.route,
    this.status,
    this.latencyMs,
  );

  final String method;
  final String host;
  final String route;
  final int? status;
  final int latencyMs;

  bool get failed => status == null || status! >= 400;

  Map<String, Object> toJson() => {
    'method': method,
    'host': host,
    'route': route,
    if (status case final status?) 'status': status,
    'latency_ms': latencyMs,
  };

  String get summary =>
      '$method $host$route · ${status ?? '—'} · ${latencyMs}ms';
}

/// Holds only allowlisted request metadata and fixed event names in memory.
/// Identity and configured origins are rendered separately in Settings.
class MobileDiagnostics extends ChangeNotifier {
  MobileDiagnostics();

  static final instance = MobileDiagnostics();
  static const _limit = 50;
  static const _maxAge = Duration(minutes: 15);
  final _network = Queue<({DateTime at, MobileNetworkEvent event})>();
  final _signals = Queue<({DateTime at, MobileDiagnosticSignal signal})>();
  bool debugUnlocked = false;
  bool _verbose = false;
  bool _slowNetwork = false;

  bool get verbose => _verbose;
  bool get slowNetwork => _slowNetwork;
  int _generation = 0;
  bool _notificationPending = false;
  bool _disposed = false;
  void Function(MobileNetworkEvent)? onFailedRequest;

  List<MobileNetworkEvent> get requests {
    final cutoff = DateTime.now().subtract(_maxAge);
    return [
      for (final entry in _network.toList().reversed)
        if (!entry.at.isBefore(cutoff)) entry.event,
    ];
  }

  List<String> get logs {
    final cutoff = DateTime.now().subtract(_maxAge);
    return [
      for (final entry in _signals.toList().reversed)
        if (!entry.at.isBefore(cutoff)) entry.signal.name,
      for (final event in requests)
        if (event.failed || verbose) event.summary,
    ];
  }

  void setVerbose({required bool enabled}) {
    _verbose = enabled;
    notifyListeners();
  }

  void setSlowNetwork({required bool enabled}) {
    _slowNetwork = enabled;
    notifyListeners();
  }

  void lockDebugMode() {
    debugUnlocked = false;
    _verbose = false;
    _slowNetwork = false;
    notifyListeners();
  }

  void clearSession() {
    _generation++;
    _network.clear();
    _signals.removeWhere(
      (entry) =>
          entry.signal != MobileDiagnosticSignal.firstFrame &&
          entry.signal != MobileDiagnosticSignal.slowFirstFrame,
    );
    lockDebugMode();
  }

  void recordSignal(MobileDiagnosticSignal signal) {
    if (_signals.length == _limit) _signals.removeFirst();
    _signals.addLast((at: DateTime.now(), signal: signal));
    _scheduleNotification();
  }

  Future<T> observe<T extends http.BaseResponse>(
    String method,
    Uri uri,
    Future<T> Function() send,
  ) async {
    final generation = _generation;
    final timer = Stopwatch()..start();
    int? status;
    try {
      final response = await send();
      status = response.statusCode;
      return response;
    } finally {
      if (generation == _generation) {
        _record(method, uri, status, timer.elapsedMilliseconds);
      }
    }
  }

  void _record(String method, Uri uri, int? status, int latencyMs) {
    if (_network.length == _limit) _network.removeFirst();
    final event = MobileNetworkEvent._(
      const {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'}.contains(method)
          ? method
          : 'OTHER',
      _safeHosts.contains(uri.host) ? uri.host : 'other',
      mobileDiagnosticRoute(uri.path),
      status != null && status >= 100 && status <= 599 ? status : null,
      latencyMs,
    );
    _network.addLast((at: DateTime.now(), event: event));
    if (event.failed) onFailedRequest?.call(event);
    _scheduleNotification();
  }

  void _scheduleNotification() {
    if (_notificationPending || !hasListeners) return;
    // A Flutter error can arrive during build. Rebuild the viewer only after
    // the current synchronous work finishes.
    _notificationPending = true;
    scheduleMicrotask(() {
      _notificationPending = false;
      if (!_disposed) notifyListeners();
    });
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  String export({int limit = _limit}) {
    final cutoff = DateTime.now().subtract(_maxAge);
    return jsonEncode({
      'schema': 'mobile_diagnostics_v1',
      'requests': requests.take(limit).map((event) => event.toJson()).toList(),
      'signals': [
        for (final entry in _signals.toList().reversed.take(limit))
          if (!entry.at.isBefore(cutoff)) entry.signal.name,
      ],
    });
  }
}

const _safeHosts = {
  'tuturuuu.com',
  'finance.tuturuuu.com',
  'inventory.tuturuuu.com',
  'tasks.tuturuuu.com',
  'contacts.tuturuuu.com',
  'calendar.tuturuuu.com',
  'teach.tuturuuu.com',
  'track.tuturuuu.com',
  'infrastructure.tuturuuu.com',
  'mail.tuturuuu.com',
};

const _fixedRoutes = {
  '/api/ai/chat',
  '/api/ai/chat/restore',
  '/api/v1/assistant/live/token',
  '/api/v1/live/session',
  '/api/v1/live/token',
  '/api/v1/mobile/version-check',
  '/api/v1/auth/mobile/client-credential',
};
final _conversationRoute = RegExp(
  r'^/api/v1/workspaces/[^/]+/chat/conversations(?:/[^/]+(?:/(messages|reactions|read|ai-settings))?)?$',
);
final _workspaceRoute = RegExp(
  r'^/api/(?:v1/)?workspaces/[^/]+/(assistant|calendar|chat|education|finance|inventory|mail|storage|tasks|users|wallets|transactions)(?:/|$)',
);

/// Returns constants or fixed alternatives from a route grammar. Never
/// returns an unmatched path segment or a dynamic identifier.
String mobileDiagnosticRoute(String path) {
  if (_fixedRoutes.contains(path)) return path;
  final conversation = _conversationRoute.firstMatch(path);
  const base = '/api/v1/workspaces/:workspace/chat/conversations';
  if (conversation != null) {
    final action = conversation.group(1);
    if (action != null) return '$base/:conversation/$action';
    return path.split('/').length == 7 ? base : '$base/:conversation';
  }
  final area = _workspaceRoute.firstMatch(path)?.group(1);
  if (area != null) return '/api/workspaces/:workspace/$area/*';
  if (path.startsWith('/api/v1/mobile-calendar/')) {
    return '/api/v1/mobile-calendar/*';
  }
  return '/other';
}
