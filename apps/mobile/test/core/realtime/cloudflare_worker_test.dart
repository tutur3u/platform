import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/realtime/cloudflare_channel.dart';

import 'fixture_presence_wait.dart';

void main() {
  final fixture = Platform.environment['TUTURUUU_REALTIME_TEST_FIXTURE'];
  test(
    'Dart and web share a real Cloudflare room',
    () async {
      final base = Uri.parse(fixture!);
      expect(base.host, '127.0.0.1');
      final http = HttpClient();
      Future<Map<String, dynamic>> read(String path) async {
        final request = await http.getUrl(base.resolve(path));
        final response = await request.close();
        expect(response.statusCode, 200);
        return jsonDecode(await utf8.decoder.bind(response).join())
            as Map<String, dynamic>;
      }

      final reply = Completer<Map<String, dynamic>>();
      final channel = CloudflareChannel(
        refreshInterval: const Duration(seconds: 1),
        resolveTicket: () => read('/ticket'),
        onMessage: (message) {
          if (message['event'] == 'web:reply' && !reply.isCompleted) {
            reply.complete(message);
          }
        },
      );
      try {
        await channel.connect();
        await channel.send({
          'type': 'broadcast',
          'event': 'native:hello',
          'payload': {'source': 'dart'},
        });
        expect(
          (await reply.future.timeout(const Duration(seconds: 5)))['payload'],
          {'source': 'web'},
        );
        await channel.send({
          'type': 'track',
          'payload': {
            'user_id': 'spoof',
            'user': {'id': 'spoof'},
            'cursor': {'x': 0.25, 'y': 0.75},
          },
        });
        await Future<void>.delayed(const Duration(milliseconds: 2200));
        final observed = await read('/observed');
        expect(observed['nativeMessages'], 1);
        expect(observed['nativeTickets'] as int, greaterThanOrEqualTo(2));
        final presence = observed['presence'] as Map<String, dynamic>;
        final sessions = presence[observed['nativeId']] as List<dynamic>;
        expect(sessions, hasLength(1));
        final session = sessions.single as Map<String, dynamic>;
        expect(session['user_id'], observed['nativeId']);
        expect(
          (session['user'] as Map<String, dynamic>)['id'],
          observed['nativeId'],
        );
        expect(session['cursor'], {'x': 0.25, 'y': 0.75});
        await channel.close();
        // Two seconds is below the renewed native ticket's expiry; expiry
        // must not stand in for a correctly propagated close.
        final left = await waitForNativeDeparture(
          () => read('/observed'),
          observed['nativeId'] as String,
        );
        expect((left['webStatuses'] as List<dynamic>).last, 'SUBSCRIBED');
        expect(
          (left['presence'] as Map<String, dynamic>)[observed['nativeId']],
          isNull,
        );
      } finally {
        await channel.close();
        http.close(force: true);
      }
    },
    skip: fixture == null
        ? 'Run the real local Worker harness mobile-local-check.ts'
        : false,
  );
}
