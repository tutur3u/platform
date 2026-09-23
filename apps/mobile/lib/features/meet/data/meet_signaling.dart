import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

typedef MeetSignalMessage = Map<String, dynamic>;

/// The room token is fetched for every connection attempt and kept in memory.
class MeetSignaling {
  MeetSignaling({
    required this.resolveUrl,
    required this.onMessage,
    required this.onStatus,
  });

  final Future<Uri> Function() resolveUrl;
  final void Function(MeetSignalMessage) onMessage;
  final void Function(String) onStatus;

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _retryTimer;
  final _pending = <String, Completer<MeetSignalMessage>>{};
  var _nextRequest = 0;
  var _attempt = 0;
  var _generation = 0;
  var _closed = false;
  bool get isOpen => _channel != null && _subscription != null;

  Future<void> connect() async {
    if (_closed) return;
    final generation = ++_generation;
    onStatus('connecting');
    try {
      final url = await resolveUrl();
      if (_closed || generation != _generation) return;
      final localDevelopment =
          kDebugMode &&
          url.scheme == 'ws' &&
          const {'localhost', '127.0.0.1'}.contains(url.host);
      if (url.scheme != 'wss' && !localDevelopment) {
        throw const FormatException('Meet requires WSS');
      }
      final channel = IOWebSocketChannel.connect(
        url,
        pingInterval: const Duration(seconds: 20),
        connectTimeout: const Duration(seconds: 12),
      );
      await channel.ready;
      if (_closed || generation != _generation) {
        await channel.sink.close();
        return;
      }
      _channel = channel;
      _attempt = 0;
      _subscription = channel.stream.listen(
        _handleMessage,
        onDone: () => _disconnected(generation),
        onError: (Object _) => _disconnected(generation),
      );
      onStatus('open');
    } on Object {
      if (!_closed && generation == _generation) _scheduleRetry();
    }
  }

  void _handleMessage(dynamic raw) {
    if (raw == 'meet:pong') return;
    if (raw is! String) return;
    MeetSignalMessage message;
    try {
      message = Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } on Object {
      return;
    }
    final requestId = message['requestId'];
    if (requestId is String) {
      final pending = _pending.remove(requestId);
      if (message['type'] == 'error') {
        pending?.completeError(
          StateError(message['error'] as String? ?? 'Meet error'),
        );
      } else if (message['type'] == 'sfu.response') {
        pending?.complete(
          Map<String, dynamic>.from(message['result'] as Map? ?? {}),
        );
      } else if (message['type'] == 'chat.message' ||
          message['type'] == 'room.ended') {
        pending?.complete(message);
      }
    }
    onMessage(message);
  }

  void _disconnected(int generation) {
    if (_closed || generation != _generation) return;
    if (_channel == null && _subscription == null) return;
    _subscription = null;
    _channel = null;
    for (final request in _pending.values) {
      request.completeError(StateError('Meet connection closed'));
    }
    _pending.clear();
    _scheduleRetry();
  }

  void _scheduleRetry() {
    if (_closed) return;
    onStatus(_attempt >= 2 ? 'error' : 'reconnecting');
    final seconds = (1 << _attempt.clamp(0, 4)).clamp(1, 16);
    _attempt++;
    _retryTimer?.cancel();
    _retryTimer = Timer(Duration(seconds: seconds), () => unawaited(connect()));
  }

  void send(MeetSignalMessage message) {
    if (!isOpen) return;
    _channel!.sink.add(jsonEncode(message));
  }

  Future<MeetSignalMessage> request(MeetSignalMessage message) async {
    if (!isOpen) throw StateError('Meet connection unavailable');
    final id = 'mobile-${++_nextRequest}';
    final pending = Completer<MeetSignalMessage>();
    _pending[id] = pending;
    send({...message, 'requestId': id});
    try {
      return await pending.future.timeout(const Duration(seconds: 15));
    } finally {
      _pending.remove(id);
    }
  }

  Future<void> close() async {
    _closed = true;
    _generation++;
    _retryTimer?.cancel();
    for (final request in _pending.values) {
      request.completeError(StateError('Meet closed'));
    }
    _pending.clear();
    await _subscription?.cancel();
    await _channel?.sink.close();
    _subscription = null;
    _channel = null;
    onStatus('closed');
  }
}
