import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_owner_socket_io.dart';

void main() {
  test('a redirect cannot forward the owner ticket', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final origin = 'ws://127.0.0.1:${server.port}';
    var redirected = false;
    server.listen((request) async {
      if (request.uri.path == '/start') {
        request.response
          ..statusCode = HttpStatus.found
          ..headers.set(HttpHeaders.locationHeader, '/forwarded');
      } else {
        redirected = true;
        request.response.statusCode = HttpStatus.badRequest;
      }
      await request.response.close();
    });

    final channel = connectFleetOwnerSocket(Uri.parse('$origin/start'), [
      'mm-bridge.v1',
      'fixture-owner-ticket',
    ]);
    // The channel handshake error is surfaced on both ready and stream.
    final drained = channel.stream.drain<void>().catchError((Object _) {});
    await expectLater(channel.ready, throwsA(isA<Exception>()));
    await drained;
    expect(redirected, isFalse);
  });
}
