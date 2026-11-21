import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_owner_live.dart';

void main() {
  test('only the approved WSS origin and path can receive a ticket', () {
    const host = 'mastermind-store.tuturuuu.com';
    const path = '/v1/bridge/connect';
    expect(parseOwnerLiveEndpoint('wss://$host$path')?.host, host);
    expect(parseOwnerLiveEndpoint('wss://$host:443$path')?.host, host);
    for (final url in [
      'ws://$host$path',
      'wss://$host.example$path',
      'wss://$host:444$path',
      'wss://127.0.0.1$path',
      'wss://$host/other',
      'wss://$host$path?x=1',
      'wss://someone@$host$path',
    ]) {
      expect(parseOwnerLiveEndpoint(url), isNull, reason: url);
    }
  });

  test('decodes the three owner frame types', () {
    for (final kind in FleetOwnerFrameKind.values) {
      final frame = decodeFleetOwnerFrame(
        jsonEncode({
          'v': 1,
          't': kind.name,
          kind.name: {'fixture': true},
        }),
      );
      expect(frame?.kind, kind);
      expect(frame?.payload, {'fixture': true});
    }
  });

  test('ignores malformed, unknown, and oversized frames', () {
    expect(decodeFleetOwnerFrame('bad-json'), isNull);
    expect(decodeFleetOwnerFrame('{"v":1,"t":"other","other":{}}'), isNull);
    expect(decodeFleetOwnerFrame('{"v":1,"t":"poke","poke":null}'), isNull);
    final padding = List.filled(12 * 1024, 'ệ').join();
    expect(
      decodeFleetOwnerFrame(
        jsonEncode({
          'v': 1,
          't': 'poke',
          'poke': {'padding': padding},
        }),
      ),
      isNull,
    );
  });
}
