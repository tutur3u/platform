import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/realtime/cloudflare_channel_schema.dart';

void main() {
  final cases =
      jsonDecode(
            File(
              '../../packages/realtime/fixtures/channel-server-frames.json',
            ).readAsStringSync(),
          )
          as List<dynamic>;
  for (final dynamic entry in cases) {
    final fixture = entry as Map<String, dynamic>;
    test('mobile wire contract: ${fixture['name']}', () {
      expect(
        isCloudflareServerFrame(fixture['frame'] as Map<String, dynamic>),
        fixture['valid'],
      );
    });
  }
}
