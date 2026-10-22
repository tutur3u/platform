import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/product_feedback/product_feedback_repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

const actor = '11111111-1111-4111-8111-111111111111';
const key = '33333333-3333-4333-8333-333333333333';
const receipt = {
  'id': '22222222-2222-4222-8222-222222222222',
  'createdAt': '2026-10-22T00:00:00Z',
};
Map<String, dynamic> requestPayload(http.Request request) {
  final value = jsonDecode(request.body);
  if (value is! Map<String, dynamic>) throw const FormatException();
  return value;
}

void main() {
  late _Client client;
  late _Auth auth;
  late _Session session;
  final calls = <http.Request>[];
  var current = true;
  var status = 201;
  Object? payload;
  late ProductFeedbackRepository repository;
  setUp(() {
    client = _Client();
    auth = _Auth();
    session = _Session();
    calls.clear();
    current = true;
    status = 201;
    payload = receipt;
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(
      const User(
        id: actor,
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01',
      ),
    );
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('PRIVATE_BEARER');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    final api = ApiClient(
      baseUrl: 'https://web.example.test',
      authClient: client,
      httpClient: MockClient((request) async {
        calls.add(request);
        return http.Response(
          jsonEncode(payload),
          status,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    addTearDown(api.dispose);
    repository = ProductFeedbackRepository(
      actorId: actor,
      isCurrent: () => current,
      api: api,
    );
  });
  test(
    'sends trimmed account text and one bounded image to Web with Bearer auth',
    () async {
      final image = Uint8List.fromList([137, 80, 78, 71]);
      final draft = ProductFeedbackDraft(
        title: ' Subject ',
        body: ' Details ',
        image: image,
        contentType: 'image/png',
      );
      image[0] = 0;
      final result = await repository.submit(
        draft: draft,
        key: key,
        token: 'PRIVATE_TURNSTILE',
      );
      expect(result.id, receipt['id']);
      expect(calls, hasLength(1));
      expect(calls.single.url.path, '/api/v1/product-feedback');
      expect(calls.single.headers['Authorization'], 'Bearer PRIVATE_BEARER');
      expect(jsonDecode(calls.single.body), {
        'title': 'Subject',
        'body': 'Details',
        'idempotencyKey': key,
        'turnstileToken': 'PRIVATE_TURNSTILE',
        'media': {'contentType': 'image/png', 'data': 'iVBORw=='},
      });
      expect(calls.single.body, isNot(contains('actor')));
      expect(() => draft.image![0] = 0, throwsUnsupportedError);
    },
  );
  for (final code in [401, 403, 429, 503]) {
    test('does not replay HTTP $code', () async {
      status = code;
      payload = {
        'error': {'code': 'feedback_unavailable'},
      };
      await expectLater(
        repository.submit(
          draft: ProductFeedbackDraft(title: 'Subject', body: 'Details'),
          key: key,
          token: 'token',
        ),
        throwsA(isA<ApiException>()),
      );
      expect(calls, hasLength(1));
    });
  }
  test('retains original idempotency reference when explicitly '
      'retrying the same immutable draft', () async {
    final draft = ProductFeedbackDraft(title: 'Subject', body: 'Details');
    status = 503;
    payload = {
      'error': {'code': 'feedback_unavailable'},
    };
    await expectLater(
      repository.submit(draft: draft, key: key, token: 'first'),
      throwsA(isA<ApiException>()),
    );
    status = 201;
    payload = receipt;
    await repository.submit(draft: draft, key: key, token: 'fresh');
    expect(calls, hasLength(2));
    expect(
      calls.map((r) => requestPayload(r)['idempotencyKey']),
      everyElement(key),
    );
    expect(requestPayload(calls.last)['turnstileToken'], 'fresh');
  });
  test('checks only the original receipt and does not submit or '
      'fabricate a receipt on absence', () async {
    status = 200;
    payload = {'receipt': null};
    expect(await repository.receipt(key), isNull);
    expect(calls.single.method, 'GET');
    expect(calls.single.url.path, '/api/v1/product-feedback/receipts/$key');
    payload = {'receipt': receipt};
    expect((await repository.receipt(key))!.id, receipt['id']);
    expect(calls.every((r) => r.method == 'GET'), isTrue);
  });
  test('rejects changed account scope before native dispatch', () async {
    current = false;
    await expectLater(
      repository.submit(
        draft: ProductFeedbackDraft(title: 'Subject', body: 'Details'),
        key: key,
        token: 'token',
      ),
      throwsA(isA<ApiException>()),
    );
    expect(calls, isEmpty);
  });
  test(
    'bounds text by Unicode code points and image bytes before native dispatch',
    () {
      expect(
        () => ProductFeedbackDraft(title: 'x' * 161, body: 'text'),
        throwsFormatException,
      );
      expect(
        () => ProductFeedbackDraft(title: 'title', body: 'x' * 8001),
        throwsFormatException,
      );
      expect(
        () => ProductFeedbackDraft(
          title: 'title',
          body: 'text',
          image: Uint8List(2097153),
          contentType: 'image/png',
        ),
        throwsFormatException,
      );
      expect(
        () => ProductFeedbackDraft(
          title: 'title',
          body: 'text',
          image: Uint8List(1),
          contentType: 'image/svg+xml',
        ),
        throwsFormatException,
      );
      expect(calls, isEmpty);
    },
  );
  test(
    'fails closed on malformed receipt instead of confirming delivery',
    () async {
      payload = {'id': 'not-a-uuid', 'createdAt': 'bad'};
      await expectLater(
        repository.submit(
          draft: ProductFeedbackDraft(title: 'Subject', body: 'Details'),
          key: key,
          token: 'token',
        ),
        throwsFormatException,
      );
      expect(calls, hasLength(1));
    },
  );
}
