import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

/// Synthetic backend bound to loopback; absent from the normal app entrypoint.
class MeetFixtureServer {
  MeetFixtureServer({
    required this.sfuRequest,
    required this.sfuIdle,
    required this.sfuReset,
  });
  static const workspaceId = '00000000-0000-4000-8000-000000000001';
  static const meetingId = '00000000-0000-4000-8000-000000000002';
  static const userId = '00000000-0000-4000-8000-000000000003';
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>) sfuRequest;
  final Future<void> Function(String) sfuIdle;
  final Future<void> Function() sfuReset;
  final String _capability = base64UrlEncode(
    List<int>.generate(32, (_) => Random.secure().nextInt(256)),
  );
  HttpServer? _server;
  WebSocket? _socket;
  Future<void> _pending = Future<void>.value();
  bool _closed = false;
  Uri get origin => Uri.parse('http://127.0.0.1:${_server!.port}');

  Future<void> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server!.listen((request) => unawaited(_http(request)));
  }

  Future<Map<String, dynamic>> createSession(
    String workspace,
    String meeting,
  ) async {
    final client = HttpClient();
    try {
      final request = await client.postUrl(origin.resolve('/session'));
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $_capability',
      );
      request.headers.contentType = ContentType.json;
      request.write(
        jsonEncode({'workspaceId': workspace, 'meetingId': meeting}),
      );
      final response = await request.close();
      if (response.statusCode != 200) {
        throw StateError('Fixture admission failed');
      }
      return Map<String, dynamic>.from(
        jsonDecode(await utf8.decoder.bind(response).join()) as Map,
      );
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _http(HttpRequest request) async {
    try {
      request.response.headers.set(HttpHeaders.cacheControlHeader, 'no-store');
      if (_closed) {
        request.response.statusCode = 503;
      } else if (request.uri.path == '/session' && request.method == 'POST') {
        if (request.headers.value(HttpHeaders.authorizationHeader) !=
            'Bearer $_capability') {
          request.response.statusCode = 403;
        } else {
          final bytes = <int>[];
          await for (final chunk in request) {
            bytes.addAll(chunk);
            if (bytes.length > 4096) {
              throw const FormatException('Fixture request too large');
            }
          }
          final body = jsonDecode(utf8.decode(bytes));
          if (body is! Map ||
              body['workspaceId'] != workspaceId ||
              body['meetingId'] != meetingId) {
            request.response.statusCode = 403;
          } else {
            request.response.headers.contentType = ContentType.json;
            request.response.write(
              jsonEncode({
                'realtimeUrl': origin
                    .replace(scheme: 'ws', path: '/meet')
                    .toString(),
                'token': _capability,
              }),
            );
          }
        }
      } else if (request.uri.path == '/meet' &&
          WebSocketTransformer.isUpgradeRequest(request)) {
        if (request.uri.queryParameters['token'] != _capability ||
            _socket != null) {
          request.response.statusCode = 403;
        } else {
          final socket = await WebSocketTransformer.upgrade(request);
          _socket = socket;
          _send({
            'type': 'ready',
            'userId': userId,
            'role': 'admin',
            'admission': 'admitted',
            'resumed': true,
            'tracks': <dynamic>[],
          });
          socket.listen(
            (raw) {
              _pending = _pending.then((_) => _message(socket, raw));
            },
            onDone: () {
              if (_socket == socket) {
                _socket = null;
                _pending = _pending.then((_) => sfuReset());
              }
            },
          );
          return;
        }
      } else {
        request.response.statusCode = 404;
      }
    } on Object {
      request.response.statusCode = 400;
    }
    await request.response.close();
  }

  void _send(Map<String, dynamic> message) {
    final socket = _socket;
    if (socket != null && socket.readyState == WebSocket.open) {
      socket.add(jsonEncode(message));
    }
  }

  void _reply(WebSocket socket, Map<String, dynamic> message) {
    if (_socket == socket) _send(message);
  }

  Future<void> _message(WebSocket socket, dynamic raw) async {
    String? requestId;
    try {
      if (_closed || _socket != socket) return;
      if (raw is! String || utf8.encode(raw).length > 128 * 1024) {
        throw const FormatException('Invalid fixture frame');
      }
      final message = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      requestId = message['requestId'] as String?;
      final type = message['type'];
      if (type is String && type.startsWith('sfu.')) {
        final result = await sfuRequest(message);
        _reply(socket, {
          'type': 'sfu.response',
          'requestId': requestId,
          'result': result,
        });
      } else if (type == 'media.idle') {
        await sfuIdle(message['sessionId'] as String);
      } else if (type == 'presence.join' || type == 'presence.update') {
        _reply(socket, {
          'type': 'presence',
          'presence': [
            {
              'userId': userId,
              'name': 'Native fixture',
              'role': 'admin',
              'media': message['media'],
            },
            {
              'userId': 'fixture-observer',
              'name': 'Local receiver',
              'role': 'speaker',
            },
          ],
        });
      } else {
        throw StateError('Unsupported fixture message');
      }
    } on Object {
      if (!_closed && _socket == socket) {
        _reply(socket, {
          'type': 'error',
          'requestId': requestId,
          'error': 'Fixture request rejected',
        });
      }
    }
  }

  void revokeScreen() => _send({
    'type': 'participant.muted',
    'userId': userId,
    'kinds': ['screen'],
  });
  Future<void> disconnect() async {
    final socket = _socket;
    _socket = null;
    await socket?.close(1001, 'Fixture reconnect');
    _pending = _pending.then((_) => sfuReset());
    await _pending;
  }

  Future<void> close() async {
    _closed = true;
    await disconnect();
    await _server?.close(force: true);
    await _pending;
  }
}
