import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/mastermind/iris/data/http_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/request_signer.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

import '../../../../helpers/mastermind_hub_harness.dart';
import '../../../../helpers/mastermind_iris_fixture.dart';

void main() {
  late List<http.Request> requests;
  late RecordingSigner signer;
  late FakeTokens tokens;

  HttpIrisRelay relay(http.Response Function(http.Request request) respond) =>
      HttpIrisRelay(
        baseUrl: hubBase,
        tokens: tokens,
        signer: signer,
        client: MockClient((request) async {
          requests.add(request);
          return respond(request);
        }),
      );

  http.Response json(Object body, {int status = 200, Map<String, String>? h}) =>
      http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json', ...?h},
      );

  setUp(() {
    requests = [];
    signer = RecordingSigner();
    tokens = FakeTokens();
  });

  group('feed', () {
    test(
      'reads a threads-1 page, oldest first, with display-only authors',
      () async {
        final result = await relay(
          (_) => json(
            irisPageJson([
              irisMessageJson(1, author: 'user', label: 'Owner'),
              irisMessageJson(2),
              irisMessageJson(3, label: 'Iris', withheld: true),
            ], nextBefore: irisMsgRef(1)),
          ),
        ).feed();
        final page = result.valueOrNull!;
        expect(page.messages.map((m) => m.ref), [
          irisMsgRef(1),
          irisMsgRef(2),
          irisMsgRef(3),
        ]);
        expect(page.messages.first.author, ThreadAuthor.ownerPhone);
        expect(page.messages.first.authorLabel, 'Owner');
        expect(page.messages.last.withheld, isTrue);
        expect(page.messages.last.text, isEmpty);
        expect(page.nextBefore, irisMsgRef(1));
        expect(requests.single.url.path, '/v1/iris/feed');
        expect(requests.single.url.queryParameters, {'limit': '50'});
      },
    );

    test('a forward poll sends after and reads next_after', () async {
      final result = await relay(
        (_) => json(
          irisPageJson(
            [irisMessageJson(5)],
            forward: true,
            nextAfter: irisMsgRef(5),
          ),
        ),
      ).feed(after: irisMsgRef(4), limit: 20);
      expect(result.valueOrNull!.nextAfter, irisMsgRef(5));
      expect(requests.single.url.queryParameters, {
        'after': irisMsgRef(4),
        'limit': '20',
      });
    });

    test('refuses before and after together without a request', () {
      expect(
        () => relay(
          (_) => json({}),
        ).feed(before: irisMsgRef(1), after: irisMsgRef(2)),
        throwsArgumentError,
      );
      expect(requests, isEmpty);
    });

    test('a drifting envelope is malformed; one bad row is skipped', () async {
      final drift = await relay(
        (_) => json({...irisPageJson([]), 'extra': 1}),
      ).feed();
      expect(drift.failureOrNull!.kind, IrisFailureKind.malformed);

      final bad = irisMessageJson(2)..['text'] = 'still has text';
      bad['withheld'] = true;
      final skipped = await relay(
        (_) => json(irisPageJson([irisMessageJson(1), bad])),
      ).feed();
      expect(skipped.valueOrNull!.messages, hasLength(1));
    });

    test('an unknown cursor is notFound', () async {
      final result = await relay(
        (_) => json({'error': 'not_found'}, status: 404),
      ).feed(after: irisMsgRef(9));
      expect(result.failureOrNull!.kind, IrisFailureKind.notFound);
    });
  });

  group('send and receipts', () {
    test('posts exactly target and text with the Idempotency-Key', () async {
      final result = await relay(
        (_) => json({'id': irisSendId, 'state': 'received'}, status: 202),
      ).send('Ship it', idempotencyKey: fixedId);
      expect(result.valueOrNull!.state, IrisReceiptState.received);
      expect(result.valueOrNull!.delivery, isNull);
      final request = requests.single;
      expect(request.method, 'POST');
      expect(request.url.path, '/v1/iris/send');
      expect(request.body, '{"target":"atlas","text":"Ship it"}');
      expect(request.headers['Idempotency-Key'], fixedId);
      expect(signer.calls.single.key, fixedId);
    });

    test('refuses a key that is not a lowercase UUID', () {
      expect(
        () => relay((_) => json({})).send('x', idempotencyKey: 'ABC'),
        throwsArgumentError,
      );
    });

    test('reads delivery only on delivered and acked receipts', () async {
      var body = <String, Object?>{
        'id': irisSendId,
        'state': 'delivered',
        'delivery': 'queue',
      };
      final client = relay((_) => json(body));
      final queued = await client.receipt(irisSendId);
      expect(queued.valueOrNull!.delivery, IrisDelivery.queue);
      expect(requests.single.url.path, '/v1/iris/send/$irisSendId');

      body = {'id': irisSendId, 'state': 'received', 'delivery': 'steer'};
      final drift = await client.receipt(irisSendId);
      expect(drift.failureOrNull!.kind, IrisFailureKind.malformed);

      body = {'id': irisSendId, 'state': 'failed', 'delivery': null};
      final failed = await client.receipt(irisSendId);
      expect(failed.valueOrNull!.state, IrisReceiptState.failed);
    });
  });

  group('signed headers', () {
    test('pass through the signer for the exact path and body', () async {
      await relay(
        (_) => json(irisPageJson([])),
      ).feed(after: irisMsgRef(1), limit: 5);
      final call = signer.calls.single;
      expect(call.method, 'GET');
      expect(call.path, '/v1/iris/feed?after=${irisMsgRef(1)}&limit=5');
      expect(call.body, isEmpty);
      final headers = requests.single.headers;
      expect(headers[IrisHeaders.device], 'dev_synthetic');
      expect(headers[IrisHeaders.ts], '1793000000');
      expect(headers[IrisHeaders.nonce], '00112233445566778899aabbccddeeff');
      expect(headers[IrisHeaders.sig], 'sig-1');
      expect(headers['Authorization'], 'Bearer synthetic-token-1');
    });

    test('a 401 refreshes once and re-signs with a fresh signature', () async {
      tokens = FakeTokens(refreshed: 'synthetic-token-2');
      var calls = 0;
      final result = await relay(
        (_) => ++calls == 1
            ? json({'error': 'unauthorized'}, status: 401)
            : json({'id': irisSendId, 'state': 'received'}, status: 202),
      ).send('hi', idempotencyKey: fixedId);
      expect(result.valueOrNull, isNotNull);
      expect(signer.calls, hasLength(2));
      expect(requests.last.headers[IrisHeaders.sig], 'sig-2');
      expect(
        requests.last.headers['Authorization'],
        'Bearer synthetic-token-2',
      );
    });

    test('the fake signer signs the canonical string', () async {
      final fake = FakeIrisRequestSigner(
        deviceId: 'dev_x',
        clock: () => DateTime.utc(2026, 10, 31),
      );
      final headers = await fake.sign(
        'post',
        '/v1/iris/send',
        utf8.encode('{}'),
        idempotencyKey: fixedId,
      );
      final canonical = irisCanonicalRequest(
        method: 'POST',
        path: '/v1/iris/send',
        body: utf8.encode('{}'),
        ts: headers[IrisHeaders.ts]!,
        nonce: headers[IrisHeaders.nonce]!,
        deviceId: 'dev_x',
        idempotencyKey: fixedId,
      );
      expect(
        headers[IrisHeaders.sig],
        sha256.convert(utf8.encode(canonical)).toString(),
      );
      expect(headers[IrisHeaders.nonce], matches(RegExp(r'^[0-9a-f]{32}$')));
    });
  });

  group('failures', () {
    Future<IrisFailure> failure(
      int status, {
      Object? body,
      Map<String, String>? h,
    }) async => (await relay(
      (_) => json(body ?? {'error': 'x'}, status: status, h: h),
    ).summary()).failureOrNull!;

    test('maps auth, rate limit and kill switch', () async {
      expect((await failure(403)).kind, IrisFailureKind.forbidden);
      final limited = await failure(429, h: {'retry-after': '30'});
      expect(limited.kind, IrisFailureKind.rateLimited);
      expect(limited.retryAfter, const Duration(seconds: 30));
      expect(
        (await failure(423, body: {'error': 'killed'})).kind,
        IrisFailureKind.killed,
      );
      expect(
        (await failure(503, body: {'error': 'iris_killed'})).kind,
        IrisFailureKind.killed,
      );
      expect((await failure(503)).kind, IrisFailureKind.unavailable);
    });

    test('a lost session is unauthorized', () async {
      tokens = FakeTokens(current: null);
      final result = await relay((_) => json({})).summary();
      expect(result.failureOrNull!.kind, IrisFailureKind.unauthorized);
      expect(requests, isEmpty);
    });

    test('a transport error is offline', () async {
      final client = HttpIrisRelay(
        baseUrl: hubBase,
        tokens: tokens,
        signer: signer,
        client: MockClient((_) async => throw http.ClientException('down')),
      );
      expect(
        (await client.summary()).failureOrNull!.kind,
        IrisFailureKind.offline,
      );
    });

    test('a cleartext base URL is unconfigured', () async {
      final client = HttpIrisRelay(
        baseUrl: Uri.parse('http://hub.example.test'),
        tokens: tokens,
        signer: signer,
      );
      expect(client.isConfigured, isFalse);
      expect(
        (await client.summary()).failureOrNull!.kind,
        IrisFailureKind.notConfigured,
      );
    });
  });

  test('backoff doubles per failure, caps, and honours Retry-After', () {
    final backoff = IrisBackoff();
    const offline = IrisFailure(IrisFailureKind.offline);
    expect(backoff.next(offline), const Duration(seconds: 30));
    expect(backoff.next(offline), const Duration(seconds: 60));
    for (var i = 0; i < 8; i++) {
      backoff.next(offline);
    }
    expect(backoff.next(offline), const Duration(minutes: 5));
    expect(backoff.next(), const Duration(seconds: 15));
    expect(
      backoff.next(
        const IrisFailure(
          IrisFailureKind.rateLimited,
          retryAfter: Duration(minutes: 10),
        ),
      ),
      const Duration(minutes: 10),
    );
  });
}
