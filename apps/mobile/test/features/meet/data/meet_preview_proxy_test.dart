import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/meet/data/meet_preview_proxy.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test(
    'private loopback previews bind the meeting and hide platform headers',
    () async {
      final api = _Api();
      final paths = <String>[];
      when(
        () => api.getStream(any(), accept: '*/*', followRedirects: false),
      ).thenAnswer((invocation) async {
        paths.add(invocation.positionalArguments.first as String);
        return http.StreamedResponse(
          Stream.value([0, 255, 128, 42]),
          200,
          headers: {
            'content-type': 'image/png',
            'set-cookie': 'must-not-leak=fixture',
            'authorization': 'must-not-leak',
            'content-security-policy': "default-src 'none'",
          },
        );
      });
      final proxy = MeetPreviewProxy(meetingId: 'fixed-meeting', api: api);
      final client = http.Client();
      await proxy.start();
      try {
        final base = Uri.parse(proxy.baseUrl);
        final binary = await client.get(
          Uri.parse('${proxy.baseUrl}3000/icon.png?q=1'),
        );
        expect(binary.statusCode, 200);
        expect(binary.bodyBytes, [0, 255, 128, 42]);
        expect(binary.headers['content-type'], 'image/png');
        expect(binary.headers['set-cookie'], isNull);
        expect(binary.headers['authorization'], isNull);
        expect(binary.headers['cache-control'], 'private, no-store');
        final path = Uri.parse(paths.single);
        expect(
          path.path,
          '/api/v1/meetings/fixed-meeting/collaboration/preview/3000/icon.png',
        );
        expect(path.queryParameters['__nativePrefix'], '${proxy.baseUrl}3000/');
        expect(path.queryParameters['q'], '1');
        for (final url in [
          base.replace(path: '/wrong/preview/3000/icon.png'),
          Uri.parse('${proxy.baseUrl}80/'),
          Uri.parse('${proxy.baseUrl}70000/'),
          Uri.parse('${proxy.baseUrl}3000/%2e%2e/escape'),
          Uri.parse('${proxy.baseUrl}3000/%2fescape'),
          Uri.parse('${proxy.baseUrl}3000/%252e%252e/escape'),
        ]) {
          expect((await client.get(url)).statusCode, isNot(200));
        }
        expect(
          (await client.post(Uri.parse('${proxy.baseUrl}3000/'))).statusCode,
          403,
        );
        expect(paths, hasLength(1));
      } finally {
        client.close();
        await proxy.close();
      }
    },
  );

  test('oversized preview streams fail before forwarding bytes', () async {
    final api = _Api();
    when(
      () => api.getStream(any(), accept: '*/*', followRedirects: false),
    ).thenAnswer(
      (_) async =>
          http.StreamedResponse(Stream.value(List.filled(600001, 1)), 200),
    );
    final proxy = MeetPreviewProxy(meetingId: 'fixed-meeting', api: api);
    await proxy.start();
    try {
      final response = await http.get(Uri.parse('${proxy.baseUrl}3000/'));
      expect(response.statusCode, 503);
      expect(response.bodyBytes, isEmpty);
    } finally {
      await proxy.close();
    }
  });
}
