import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';

void main() {
  test('streamed 429 retains retry and allowlisted guard metadata', () async {
    final api = ApiClient(
      baseUrl: 'https://example.test',
      httpClient: MockClient(
        (_) async => http.Response(
          '{"message":"Slow down"}',
          429,
          headers: {
            'retry-after': '60',
            'x-proxy-block-reason': 'route-rate-limit',
            'x-ratelimit-policy': 'default',
            'x-ratelimit-caller-class': 'authenticated',
            'x-ratelimit-window': 'minute',
          },
        ),
      ),
    );
    addTearDown(api.dispose);
    await expectLater(
      api.sendJsonStream('POST', '/synthetic-stream', {}, requiresAuth: false),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'status', 429)
            .having((e) => e.retryAfter, 'cooldown', 60)
            .having(
              (e) => e.rateLimitDiagnostics?.safeSummary,
              'guard metadata',
              'reason=route-rate-limit; policy=default; '
                  'caller=authenticated; window=minute',
            ),
      ),
    );
  });
  test(
    'malformed stream errors retain status without raw response text',
    () async {
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient(
          (_) async => http.Response('synthetic-private-body', 503),
        ),
      );
      addTearDown(api.dispose);
      await expectLater(
        api.sendJsonStream(
          'POST',
          '/synthetic-stream',
          {},
          requiresAuth: false,
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 503)
              .having((e) => e.message, 'message', 'Request failed'),
        ),
      );
    },
  );
  test('successful streamed responses stay consumable', () async {
    final api = ApiClient(
      baseUrl: 'https://example.test',
      httpClient: MockClient(
        (_) async => http.Response(
          'data: synthetic\n\n',
          200,
          headers: {'content-type': 'text/event-stream'},
        ),
      ),
    );
    addTearDown(api.dispose);
    final response = await api.sendJsonStream(
      'POST',
      '/synthetic-stream',
      {},
      requiresAuth: false,
    );
    expect(await response.stream.bytesToString(), 'data: synthetic\n\n');
  });
}
