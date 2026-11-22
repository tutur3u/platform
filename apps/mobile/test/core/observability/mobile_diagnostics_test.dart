import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/observability/mobile_diagnostics.dart';

void main() {
  test('requests are recorded as allowlisted metadata only', () async {
    final diagnostics = MobileDiagnostics();
    addTearDown(diagnostics.dispose);
    final failed = <MobileNetworkEvent>[];
    diagnostics.onFailedRequest = failed.add;

    await diagnostics.observe(
      'POST',
      Uri.parse(
        'https://private-token@tuturuuu.com'
        '/api/v1/workspaces/private-workspace/chat/conversations/'
        'private-conversation/messages?token=secret-query#secret-fragment',
      ),
      () async => http.Response(
        'sensitive body',
        503,
        headers: {'authorization': 'sensitive header'},
      ),
    );

    expect(failed.single.toJson(), {
      'method': 'POST',
      'host': 'tuturuuu.com',
      'route':
          '/api/v1/workspaces/:workspace/chat/conversations'
          '/:conversation/messages',
      'status': 503,
      'latency_ms': isA<int>(),
    });
    for (final secret in ['private-', 'sensitive', 'secret-']) {
      expect(diagnostics.export(), isNot(contains(secret)));
    }
  });

  test('an unrecognized route, host, and method never appear', () async {
    final diagnostics = MobileDiagnostics();
    addTearDown(diagnostics.dispose);
    await diagnostics.observe(
      'SECRET',
      Uri.parse('https://private-host.example/private-payload'),
      () async => http.Response('', 200),
    );
    final event = diagnostics.requests.single;
    expect(event.route, '/other');
    expect(event.host, 'other');
    expect(event.method, 'OTHER');
    expect(diagnostics.logs, isEmpty);
    diagnostics.setVerbose(enabled: true);
    expect(diagnostics.logs, [event.summary]);
  });

  test('bounded history and account changes discard old entries', () async {
    final diagnostics = MobileDiagnostics();
    addTearDown(diagnostics.dispose);
    final uri = Uri.parse('https://tuturuuu.com/api/v1/assistant/live/token');
    for (var i = 0; i < 55; i++) {
      await diagnostics.observe(
        'POST',
        uri,
        () async => http.Response('', 200),
      );
    }
    expect(diagnostics.requests, hasLength(50));

    final pending = diagnostics.observe('POST', uri, () async {
      await Future<void>.delayed(Duration.zero);
      return http.Response('', 200);
    });
    diagnostics.clearSession();
    await pending;
    expect(diagnostics.requests, isEmpty);
  });
}
