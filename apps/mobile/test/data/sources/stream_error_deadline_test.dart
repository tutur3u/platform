import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/bounded_stream_error.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

class _StreamClient extends http.BaseClient {
  _StreamClient(this.body);
  final Stream<List<int>> body;
  int requests = 0;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requests++;
    return http.StreamedResponse(
      body,
      429,
      headers: {
        'retry-after': '60',
        'x-proxy-block-reason': 'route-rate-limit',
      },
      request: request,
    );
  }
}

const _owner = User(
  id: 'owner-a',
  appMetadata: {},
  userMetadata: {},
  aud: 'authenticated',
  createdAt: '2026-01-01',
);
const _other = User(
  id: 'owner-b',
  appMetadata: {},
  userMetadata: {},
  aud: 'authenticated',
  createdAt: '2026-01-01',
);

void main() {
  for (final partial in [false, true]) {
    test('deadline cancels stalled source; partial=$partial', () async {
      var canceled = false;
      final controller = StreamController<List<int>>(
        onCancel: () => canceled = true,
      );
      final result = readBoundedStreamError(
        http.StreamedResponse(
          controller.stream,
          503,
          headers: {'retry-after': '60'},
        ),
        timeout: const Duration(milliseconds: 20),
      );
      if (partial) controller.add(utf8.encode('{"message":"unfinished'));
      final response = await result.timeout(const Duration(seconds: 1));
      expect(canceled, isTrue);
      expect(response.statusCode, 503);
      expect(response.headers['retry-after'], '60');
      expect(response.body, isEmpty);
      await controller.close();
    });
  }
  test('deadline is total time even while chunks continue arriving', () async {
    var canceled = false;
    final controller = StreamController<List<int>>(
      onCancel: () => canceled = true,
    );
    final timer = Timer.periodic(
      const Duration(milliseconds: 2),
      (_) => controller.add([65]),
    );
    final response = await readBoundedStreamError(
      http.StreamedResponse(controller.stream, 503),
      timeout: const Duration(milliseconds: 20),
    ).timeout(const Duration(seconds: 1));
    timer.cancel();
    expect(canceled, isTrue);
    expect(response.body, isEmpty);
    await controller.close();
  });
  test('deadline does not wait for stalled cancellation cleanup', () async {
    final cleanup = Completer<void>();
    var canceled = false;
    final controller = StreamController<List<int>>(
      onCancel: () {
        canceled = true;
        return cleanup.future;
      },
    );
    final response = await readBoundedStreamError(
      http.StreamedResponse(controller.stream, 503),
      timeout: const Duration(milliseconds: 20),
    ).timeout(const Duration(seconds: 1));
    expect(canceled, isTrue);
    expect(response.statusCode, 503);
    cleanup.complete();
    await controller.close();
  });
  test('source TimeoutException preserves the received HTTP status', () async {
    final response = await readBoundedStreamError(
      http.StreamedResponse(
        Stream<List<int>>.error(TimeoutException('synthetic')),
        503,
      ),
    );
    expect(response.statusCode, 503);
    expect(response.body, isEmpty);
  });
  for (final departure in ['none', 'logout', 'switch', 'ABA']) {
    test('actual API stalled 429 guards $departure and cancels', () async {
      final client = _Client();
      final auth = _Auth();
      final session = _Session();
      final changes = StreamController<AuthState>.broadcast(sync: true);
      User? current = _owner;
      when(() => client.auth).thenReturn(auth);
      when(() => auth.currentUser).thenAnswer((_) => current);
      when(() => auth.currentSession).thenReturn(session);
      when(() => auth.onAuthStateChange).thenAnswer((_) => changes.stream);
      when(() => session.accessToken).thenReturn('synthetic-access');
      when(() => session.user).thenAnswer((_) => current ?? _owner);
      when(() => session.expiresAt).thenReturn(
        DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
            1000,
      );
      final reading = Completer<void>();
      var canceled = false;
      final body = StreamController<List<int>>(
        onListen: reading.complete,
        onCancel: () => canceled = true,
      );
      final httpClient = _StreamClient(body.stream);
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: httpClient,
        requestTimeout: const Duration(milliseconds: 40),
      );
      final request = api.sendJsonStream('POST', '/synthetic-stream', {});
      final assertion = expectLater(
        request,
        throwsA(
          isA<ApiException>()
              .having(
                (e) => e.statusCode,
                'status',
                departure == 'none' ? 429 : 401,
              )
              .having(
                (e) => e.retryAfter,
                'scoped retry metadata',
                departure == 'none' ? 60 : null,
              )
              .having(
                (e) => e.message,
                'no partial payload',
                departure == 'none'
                    ? 'Request failed'
                    : 'Account changed during request',
              ),
        ),
      );
      await reading.future;
      body.add(utf8.encode('{"message":"synthetic-incomplete'));
      if (departure != 'none') {
        current = departure == 'switch' ? _other : null;
        changes.add(
          AuthState(
            departure == 'switch'
                ? AuthChangeEvent.signedIn
                : AuthChangeEvent.signedOut,
            departure == 'switch' ? session : null,
          ),
        );
        if (departure == 'ABA') {
          current = _owner;
          changes.add(AuthState(AuthChangeEvent.signedIn, session));
        }
      }
      await assertion.timeout(const Duration(seconds: 1));
      expect(canceled, isTrue);
      expect(httpClient.requests, 1);
      expect(changes.hasListener, isFalse);
      api.dispose();
      await body.close();
      await changes.close();
    });
  }
}
