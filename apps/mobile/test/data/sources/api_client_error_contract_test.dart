import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';

void main() {
  test(
    'retains safe 429 guard diagnostics through the HTTP boundary',
    () async {
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient(
          (_) async => http.Response(
            '{}',
            429,
            headers: {
              'x-proxy-block-reason': 'route-rate-limit',
              'x-ratelimit-policy': 'default',
              'x-ratelimit-caller-class': 'anonymous',
              'x-ratelimit-window': 'hour',
              'retry-after': '60',
            },
          ),
        ),
      );
      addTearDown(api.dispose);
      await expectLater(
        api.getJson('/calendar-settings', requiresAuth: false),
        throwsA(
          isA<ApiException>()
              .having((e) => e.retryAfter, 'retry delay', 60)
              .having(
                (e) => e.rateLimitDiagnostics?.safeSummary,
                'safe diagnostics',
                'reason=route-rate-limit; policy=default; caller=anonymous; '
                    'window=hour',
              ),
        ),
      );
    },
  );

  test('excludes arbitrary and private 429 header values', () async {
    final api = ApiClient(
      baseUrl: 'https://example.test',
      httpClient: MockClient(
        (_) async => http.Response(
          '{}',
          429,
          headers: {
            'x-proxy-block-reason': 'private-token',
            'x-ratelimit-policy': 'private-workspace',
            'x-ratelimit-caller-class': 'private-user',
            'x-ratelimit-window': 'private-address',
            'authorization': 'Bearer private-token',
            'set-cookie': 'session=private-token',
          },
        ),
      ),
    );
    addTearDown(api.dispose);
    await expectLater(
      api.getJson('/calendar-settings', requiresAuth: false),
      throwsA(
        isA<ApiException>().having(
          (e) => e.rateLimitDiagnostics?.safeSummary,
          'safe diagnostics',
          'reason=unknown; policy=unknown; caller=unknown; window=unknown',
        ),
      ),
    );
  });

  for (final retry in <Object>[3, '3', -1]) {
    test(
      'body retry cooldown requires a nonnegative integer: $retry',
      () async {
        final api = ApiClient(
          baseUrl: 'https://example.test',
          httpClient: MockClient(
            (_) async => http.Response(
              jsonEncode({'message': 42, 'error': false, 'retryAfter': retry}),
              429,
            ),
          ),
        );
        addTearDown(api.dispose);
        await expectLater(
          api.postJson('/sales', {}, requiresAuth: false),
          throwsA(
            isA<ApiException>()
                .having((e) => e.statusCode, 'status', 429)
                .having((e) => e.message, 'message', 'Request failed')
                .having((e) => e.retryAfter, 'retry', retry == 3 ? 3 : null),
          ),
        );
      },
    );
  }

  for (final errors in <Object>[
    [
      {'message': 'Amount must be positive'},
    ],
    {
      'formErrors': <String>[],
      'fieldErrors': {
        'amount': ['Amount must be positive'],
      },
    },
  ]) {
    test('preserves validation status for ${errors.runtimeType}', () async {
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient(
          (_) async => http.Response(
            jsonEncode({'message': 'Invalid input', 'errors': errors}),
            400,
          ),
        ),
      );
      addTearDown(api.dispose);
      await expectLater(
        api.postJson('/wallets/interest', {}, requiresAuth: false),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 400)
              .having(
                (e) => e.message,
                'message',
                'Invalid input: Amount must be positive',
              ),
        ),
      );
    });
  }

  test(
    'malformed optional error fields retain server failure status',
    () async {
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'error': {'detail': 'unrecognized envelope'},
              'errors': 42,
              'retryAfter': '3',
              'code': 12,
            }),
            503,
            headers: {'retry-after': '7'},
          ),
        ),
      );
      addTearDown(api.dispose);
      await expectLater(
        api.postJson('/sales', {}, requiresAuth: false),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 503)
              .having((e) => e.message, 'message', 'Request failed')
              .having((e) => e.retryAfter, 'retry', 7)
              .having((e) => e.code, 'code', isNull),
        ),
      );
    },
  );
}
