import 'dart:async';
import 'dart:convert';

import 'package:mobile/data/sources/api_client.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

enum FleetOwnerFrameKind { poke, machine, receipt }

typedef FleetOwnerFrame = ({
  FleetOwnerFrameKind kind,
  Map<String, dynamic> payload,
});

const _maxFrameBytes = 32 * 1024;
const _ticketPath = '/api/v1/mastermind/fleet/live/ticket';

FleetOwnerFrame? decodeFleetOwnerFrame(Object? raw) {
  if (raw is! String ||
      raw.length > _maxFrameBytes ||
      utf8.encode(raw).length > _maxFrameBytes) {
    return null;
  }
  try {
    final data = jsonDecode(raw);
    if (data is! Map<String, dynamic> || data['v'] != 1) return null;
    final kind = switch (data['t']) {
      'poke' => FleetOwnerFrameKind.poke,
      'machine' => FleetOwnerFrameKind.machine,
      'receipt' => FleetOwnerFrameKind.receipt,
      _ => null,
    };
    if (kind == null) return null;
    final payload = data[kind.name];
    if (payload is! Map<String, dynamic>) return null;
    return (kind: kind, payload: payload);
  } on FormatException {
    return null;
  }
}

/// Foreground, listen-only fleet connection. A receipt is a hint to refetch
/// the verified reply; it is not itself a verified reply.
class FleetOwnerLive {
  FleetOwnerLive({required this.onFrame, ApiClient? api})
    : _api = api ?? ApiClient();

  final ApiClient _api;
  final void Function(FleetOwnerFrame) onFrame;
  final _revisions = <String, int>{};
  WebSocketChannel? _socket;
  StreamSubscription<Object?>? _subscription;
  Timer? _retry;
  bool _active = false;
  int _attempts = 0;
  int _generation = 0;

  void start() {
    if (_active) return;
    _active = true;
    _attempts = 0;
    unawaited(_connect());
  }

  void stop() {
    if (!_active) return;
    _active = false;
    _generation++;
    _retry?.cancel();
    _releaseSocket();
    _revisions.clear();
  }

  void _releaseSocket() {
    final subscription = _subscription;
    final socket = _socket;
    _subscription = null;
    _socket = null;
    unawaited(_close(subscription, socket));
  }

  static Future<void> _close(
    StreamSubscription<Object?>? subscription,
    WebSocketChannel? socket,
  ) async {
    try {
      await subscription?.cancel();
    } on Object {
      // A failed subscription cleanup does not prevent the socket from closing.
    }
    try {
      await socket?.sink.close();
    } on Object {
      // A disconnected socket can already be closed.
    }
  }

  Future<void> _connect() async {
    if (!_active || _attempts >= 3) return;
    _attempts++;
    final current = ++_generation;
    try {
      final ticket = await _api.postJson(
        _ticketPath,
        const <String, Object?>{},
        timeout: const Duration(seconds: 8),
      );
      if (current != _generation) return;
      final url = ticket['url'];
      final key = ticket['ticket'];
      final expiresAt = ticket['expiresAt'];
      final target = url is String && url.length <= 2048
          ? Uri.tryParse(url)
          : null;
      final expiry = expiresAt is String ? DateTime.tryParse(expiresAt) : null;
      if (target == null ||
          target.scheme != 'wss' ||
          target.host.isEmpty ||
          target.userInfo.isNotEmpty ||
          target.hasQuery ||
          target.hasFragment ||
          key is! String ||
          !RegExp(r'^[\w-]{32,128}$').hasMatch(key) ||
          expiry == null ||
          !expiry.isAfter(DateTime.now())) {
        _retryConnection(current);
        return;
      }
      final candidate = WebSocketChannel.connect(
        target,
        protocols: ['mm-bridge.v1', key],
      );
      _socket = candidate;
      await candidate.ready.timeout(const Duration(seconds: 10));
      if (current != _generation) return;
      _subscription = candidate.stream.listen(
        (Object? raw) {
          if (current != _generation) return;
          final frame = decodeFleetOwnerFrame(raw);
          if (frame == null) return;
          if (frame.kind == FleetOwnerFrameKind.poke &&
              !_recordPoke(frame.payload))
            return;
          onFrame(frame);
        },
        onDone: () => _retryConnection(current),
        onError: (Object _) => _retryConnection(current),
      );
    } on Object {
      _retryConnection(current);
    }
  }

  void _retryConnection(int current) {
    if (!_active || current != _generation) return;
    _generation++;
    _releaseSocket();
    if (_attempts < 3) {
      _retry = Timer(const Duration(seconds: 15), () => unawaited(_connect()));
    }
  }

  bool _recordPoke(Map<String, dynamic> poke) {
    final id = poke['machineId'];
    final topic = poke['topic'];
    final revision = poke['revision'];
    if (id is! String ||
        !RegExp(r'^[a-z0-9][a-z0-9._-]{0,63}$').hasMatch(id) ||
        !const {'state', 'usage', 'status', 'threads'}.contains(topic) ||
        revision is! int ||
        revision < 0 ||
        revision > 9007199254740991) {
      return false;
    }
    final key = '$id:$topic';
    final previous = _revisions[key];
    if (previous == null ? _revisions.length >= 128 : revision <= previous) {
      return false;
    }
    _revisions[key] = revision;
    return true;
  }
}
