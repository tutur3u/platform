import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/meet/fixtures/meet_fixture_server.dart';

void main() {
  late MeetFixtureServer server;
  late HttpClient http;
  final sockets = <WebSocket>[];
  final requests = <Map<String, dynamic>>[];
  var resets = 0;
  Completer<void>? hold;
  Completer<void>? started;
  setUp(() async {
    resets = 0;
    hold = null;
    started = null;
    requests.clear();
    http = HttpClient();
    server = MeetFixtureServer(
      sfuRequest: (message) async {
        requests.add(message);
        started?.complete();
        await hold?.future;
        return {'sessionId': 'synthetic-session', 'iceServers': <dynamic>[]};
      },
      sfuIdle: (_) async {},
      sfuReset: () async {
        resets++;
      },
    );
    await server.start();
  });
  tearDown(() async {
    for (final socket in sockets) {
      await socket.close();
    }
    sockets.clear();
    http.close(force: true);
    await server.close();
  });
  Future<WebSocket> join() async {
    final session = await server.createSession(
      MeetFixtureServer.workspaceId,
      MeetFixtureServer.meetingId,
    );
    final url = Uri.parse(
      session['realtimeUrl'] as String,
    ).replace(queryParameters: {'token': session['token'] as String});
    final socket = await WebSocket.connect(url.toString());
    sockets.add(socket);
    return socket;
  }

  test(
    'loopback backend rejects missing capability and foreign room scope',
    () async {
      expect(server.origin.host, '127.0.0.1');
      final request = await http.postUrl(server.origin.resolve('/session'));
      request.write('{}');
      final response = await request.close();
      expect(response.statusCode, 403);
      expect(
        response.headers.value(HttpHeaders.cacheControlHeader),
        'no-store',
      );
      await response.drain<void>();
      await expectLater(
        server.createSession('foreign', MeetFixtureServer.meetingId),
        throwsStateError,
      );
      await expectLater(
        WebSocket.connect(
          server.origin.replace(scheme: 'ws', path: '/meet').toString(),
        ),
        throwsA(isA<WebSocketException>()),
      );
    },
  );
  test(
    'wire admits, publishes, revokes and rejects unknown operations',
    () async {
      final socket = await join();
      final frames = StreamIterator<dynamic>(socket);
      Future<Map<String, dynamic>> next() async {
        expect(
          await frames.moveNext().timeout(const Duration(seconds: 3)),
          isTrue,
        );
        return Map<String, dynamic>.from(
          jsonDecode(frames.current as String) as Map,
        );
      }

      final ready = await next();
      expect(ready['admission'], 'admitted');
      expect(ready['userId'], MeetFixtureServer.userId);
      socket.add(
        jsonEncode({
          'type': 'presence.join',
          'media': {'screenEnabled': false},
        }),
      );
      expect((await next())['presence'], hasLength(2));
      socket.add(
        jsonEncode({'type': 'sfu.session.create', 'requestId': 'mobile-1'}),
      );
      final published = await next();
      expect(published['type'], 'sfu.response');
      expect(published['requestId'], 'mobile-1');
      expect(requests.single['type'], 'sfu.session.create');
      server.revokeScreen();
      final revoke = await next();
      expect(revoke['type'], 'participant.muted');
      expect(revoke['kinds'], ['screen']);
      socket.add(jsonEncode({'type': 'unsupported', 'requestId': 'mobile-2'}));
      expect((await next())['type'], 'error');
      await frames.cancel();
    },
  );
  test(
    'single admitted socket and reconnect release synthetic media sessions',
    () async {
      final first = await join();
      final disconnected = Completer<void>();
      final subscription = first.listen((_) {}, onDone: disconnected.complete);
      await expectLater(join(), throwsA(isA<WebSocketException>()));
      await server.disconnect();
      await disconnected.future.timeout(const Duration(seconds: 3));
      await subscription.cancel();
      expect(resets, greaterThanOrEqualTo(1));
      final second = await join();
      expect(second.readyState, WebSocket.open);
    },
  );
  test('late media responses never cross a reconnect boundary', () async {
    hold = Completer<void>();
    started = Completer<void>();
    final first = await join();
    final firstListener = first.listen((_) {});
    first.add(jsonEncode({'type': 'sfu.session.create', 'requestId': 'old'}));
    await started!.future.timeout(const Duration(seconds: 3));
    final disconnect = server.disconnect();
    final second = await join();
    final frames = StreamIterator<dynamic>(second);
    expect(await frames.moveNext(), isTrue);
    expect((jsonDecode(frames.current as String) as Map)['type'], 'ready');
    hold!.complete();
    started = null;
    await disconnect;
    second.add(jsonEncode({'type': 'presence.join'}));
    expect(await frames.moveNext().timeout(const Duration(seconds: 3)), isTrue);
    expect((jsonDecode(frames.current as String) as Map)['type'], 'presence');
    await firstListener.cancel();
    await frames.cancel();
  });
  test('malformed and oversized frames never invoke media adapter', () async {
    final socket = await join();
    final messages = StreamIterator<dynamic>(socket);
    await messages.moveNext(); // ready
    for (final raw in ['{', 'x' * (128 * 1024 + 1)]) {
      socket.add(raw);
      expect(
        await messages.moveNext().timeout(const Duration(seconds: 3)),
        isTrue,
      );
      expect((jsonDecode(messages.current as String) as Map)['type'], 'error');
    }
    expect(requests, isEmpty);
    await messages.cancel();
  });
}
