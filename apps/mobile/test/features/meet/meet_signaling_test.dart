import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/meet/data/meet_signaling.dart';

void main() {
  test('SFU responses resolve their matching native requests', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final received = <Map<String, dynamic>>[];
    server.listen((request) async {
      final socket = await WebSocketTransformer.upgrade(request);
      socket.listen((raw) {
        final message = Map<String, dynamic>.from(
          jsonDecode(raw as String) as Map,
        );
        received.add(message);
        if (received.length == 2) {
          for (final entry in received.reversed) {
            socket.add(
              jsonEncode({
                'type': 'sfu.response',
                'requestId': entry['requestId'],
                'action': entry['type'],
                'result': {'action': entry['type']},
              }),
            );
          }
        }
      });
    });
    final signaling = MeetSignaling(
      resolveUrl: () async => Uri.parse('ws://127.0.0.1:${server.port}/room'),
      onMessage: (_) {},
      onStatus: (_) {},
    );
    addTearDown(() async {
      await signaling.close();
      await server.close(force: true);
    });

    await signaling.connect();
    final first = signaling.request({'type': 'sfu.session.create'});
    final second = signaling.request({
      'type': 'sfu.renegotiate',
      'sessionId': 'session',
    });
    expect((await first)['action'], 'sfu.session.create');
    expect((await second)['action'], 'sfu.renegotiate');
    expect(received.map((message) => message['requestId']).toSet().length, 2);
  });
}
