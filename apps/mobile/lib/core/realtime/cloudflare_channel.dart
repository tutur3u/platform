import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:mobile/core/realtime/cloudflare_channel_schema.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Refreshes short-lived tickets. Every reconnect reauthorizes access.
class CloudflareChannel {
  CloudflareChannel({
    required this.resolveTicket,
    required this.onMessage,
    WebSocketChannel Function(Uri)? connectSocket,
    this.refreshInterval = const Duration(seconds: 45),
  }) : _connectSocket = connectSocket ?? WebSocketChannel.connect;

  final Duration refreshInterval;
  final Future<Map<String, dynamic>> Function() resolveTicket;
  Uri? _endpoint;
  Map<String, dynamic>? _tracked;
  final void Function(Map<String, dynamic>) onMessage;
  final WebSocketChannel Function(Uri) _connectSocket;
  WebSocketChannel? _socket;
  StreamSubscription<dynamic>? _subscription;
  Timer? _refresh;
  Timer? _retry;
  bool _closed = false;
  int _generation = 0;
  int _attempt = 0;

  Future<void> connect() async {
    if (_closed) return;
    _retry?.cancel();
    _retry = null;
    final generation = ++_generation;
    WebSocketChannel? candidate;
    try {
      final ticket = await resolveTicket();
      if (_closed || generation != _generation) return;
      final endpoint = Uri.parse(ticket['endpoint'] as String);
      if (endpoint.scheme != 'wss' &&
          !(kDebugMode &&
              endpoint.scheme == 'ws' &&
              const {'localhost', '127.0.0.1'}.contains(endpoint.host))) {
        throw const FormatException('Realtime requires WSS');
      }
      final token = ticket['token'] as String;
      candidate = _connectSocket(
        endpoint.replace(queryParameters: {'token': token}),
      );
      await candidate.ready.timeout(const Duration(seconds: 10));
      if (_closed || generation != _generation) {
        await candidate.sink.close();
        return;
      }
      final old = _socket;
      final previous = _subscription;
      _socket = candidate;
      _endpoint = endpoint;
      _subscription = candidate.stream.listen(
        (dynamic raw) {
          if (_closed ||
              generation != _generation ||
              raw is! String ||
              utf8.encode(raw).length > 3000000) {
            return;
          }
          try {
            final decoded = jsonDecode(raw);
            if (decoded is Map<String, dynamic> &&
                isCloudflareServerFrame(decoded)) {
              onMessage(decoded);
            }
          } on Object {
            /* Ignore malformed frames; features validate payloads. */
          }
        },
        onDone: () => _disconnected(generation),
        onError: (Object _) => _disconnected(generation),
      );
      await previous?.cancel();
      await old?.sink.close();
      if (_closed || generation != _generation) return;
      if (_tracked != null) {
        candidate.sink.add(jsonEncode({'type': 'track', 'payload': _tracked}));
      }
      _attempt = 0;
      _refresh?.cancel();
      _scheduleRefresh(generation);
    } on Object {
      await candidate?.sink.close();
      if (!_closed && generation == _generation) _disconnected(generation);
    }
  }

  void _scheduleRefresh(int generation) {
    _refresh?.cancel();
    _refresh = Timer(
      refreshInterval,
      () => unawaited(_refreshTicket(generation)),
    );
  }

  Future<void> _refreshTicket(int generation) async {
    if (_closed || generation != _generation) return;
    try {
      final ticket = await resolveTicket();
      if (_closed || generation != _generation) return;
      if (Uri.parse(ticket['endpoint'] as String) != _endpoint) {
        throw const FormatException('Realtime endpoint changed');
      }
      await send({'type': 'authenticate', 'token': ticket['token'] as String});
      _scheduleRefresh(generation);
    } on Object {
      if (!_closed && generation == _generation) {
        await _socket?.sink.close();
        _disconnected(generation);
      }
    }
  }

  void _disconnected(int generation) {
    if (_closed || generation != _generation || _retry != null) return;
    _refresh?.cancel();
    _socket = null;
    final milliseconds = (500 * (1 << _attempt.clamp(0, 6))).clamp(500, 30000);
    _attempt++;
    _retry = Timer(Duration(milliseconds: milliseconds), () {
      _retry = null;
      unawaited(connect());
    });
  }

  Future<void> send(Map<String, dynamic> message) async {
    if (_closed || _socket == null) throw StateError('Realtime disconnected');
    final encoded = jsonEncode(message);
    if (utf8.encode(encoded).length > 3000000) {
      throw const FormatException('Realtime frame exceeds limit');
    }
    if (message['type'] == 'track' &&
        message['payload'] is Map<String, dynamic>) {
      _tracked = Map<String, dynamic>.from(
        message['payload'] as Map<String, dynamic>,
      );
    } else if (message['type'] == 'untrack') {
      _tracked = null;
    }
    _socket!.sink.add(encoded);
  }

  Future<void> close() async {
    _closed = true;
    _generation++;
    _refresh?.cancel();
    _retry?.cancel();
    await _subscription?.cancel();
    await _socket?.sink.close();
    _subscription = null;
    _socket = null;
    _tracked = null;
  }
}
