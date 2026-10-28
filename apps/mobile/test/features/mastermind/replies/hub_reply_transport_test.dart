import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/mastermind/replies/hub_reply_transport.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

import '../../../helpers/mastermind_hub_harness.dart';
import '../../../helpers/mastermind_replies_fixture.dart';

const _key = '33333333-3333-4333-8333-333333333333';

OutboxEntry _entry({String? text}) => OutboxEntry(
  idempotencyKey: _key,
  itemId: inboxItemId(1),
  versionHash: inboxHash('a'),
  createdAt: DateTime.utc(2026, 1, 31, 17),
  optionIndex: text == null ? 1 : null,
  optionLabel: text == null ? 'Defer' : null,
  text: text,
);

HubReplyTransport _transport(FakeHub hub, FakeTokens tokens) =>
    HubReplyTransport(
      baseUrl: hubBase,
      tokens: tokens,
      client: hub.client,
      timeout: const Duration(seconds: 5),
    );

http.StreamedResponse _created() => hubReply(
  201,
  body: utf8.encode(jsonEncode({'id': 'r', 'state': 'received'})),
);

void main() {
  group('request', () {
    test(
      'POSTs the exact body with the stored key and a bearer token',
      () async {
        final bodies = <String>[];
        final headers = <String, String>{};
        late final String method;
        late final Uri url;
        late final bool followRedirects;
        final client = MockClient.streaming((request, body) async {
          method = request.method;
          url = request.url;
          followRedirects = request.followRedirects;
          headers.addAll(request.headers);
          bodies.add(utf8.decode(await body.expand((c) => c).toList()));
          return _created();
        });
        final transport = HubReplyTransport(
          baseUrl: hubBase,
          tokens: FakeTokens(),
          client: client,
        );
        expect(await transport.send(_entry()), isA<ReplyAccepted>());
        expect(method, 'POST');
        expect(url.toString(), 'https://hub.example.test/v1/replies');
        expect(headers['Idempotency-Key'], _key);
        expect(headers['Authorization'], 'Bearer synthetic-token-1');
        expect(headers['Content-Type'], 'application/json');
        expect(followRedirects, isFalse);
        expect(jsonDecode(bodies.single), {
          'schema_version': '1.4',
          'item_id': inboxItemId(1),
          'version_hash': inboxHash('a'),
          'option_index': 1,
        });
      },
    );

    test('a text reply sends text and no option_index', () async {
      final bodies = <String>[];
      final client = MockClient.streaming((request, body) async {
        bodies.add(utf8.decode(await body.expand((c) => c).toList()));
        return _created();
      });
      await HubReplyTransport(
        baseUrl: hubBase,
        tokens: FakeTokens(),
        client: client,
      ).send(_entry(text: 'Go ahead.'));
      expect(jsonDecode(bodies.single), {
        'schema_version': '1.4',
        'item_id': inboxItemId(1),
        'version_hash': inboxHash('a'),
        'text': 'Go ahead.',
      });
    });

    test(
      'is unavailable, with no request, when no hub is configured',
      () async {
        final hub = FakeHub((_) => _created());
        final transport = HubReplyTransport(
          baseUrl: null,
          tokens: FakeTokens(),
          client: hub.client,
        );
        expect(transport.isConfigured, isFalse);
        expect(await transport.send(_entry()), isA<ReplyUnavailable>());
        expect(hub.requests, isEmpty);
      },
    );

    test('refuses a cleartext hub URL', () async {
      final transport = HubReplyTransport(
        baseUrl: Uri.parse('http://hub.example.test'),
        tokens: FakeTokens(),
      );
      expect(transport.isConfigured, isFalse);
    });
  });

  group('outcomes', () {
    Future<ReplyOutcome> send(
      FutureOr<http.StreamedResponse> Function(RecordedRequest) handler,
    ) => _transport(FakeHub(handler), FakeTokens()).send(_entry());

    test('201 is accepted', () async {
      expect((await send((_) => _created())) as ReplyAccepted, isNotNull);
    });

    test('200 is a replay and counts as accepted', () async {
      final outcome = await send((_) => hubReply(200));
      expect(outcome, isA<ReplyAccepted>());
      expect((outcome as ReplyAccepted).replayed, isTrue);
    });

    test('400 bad_request is rejected, unsafe_text says so', () async {
      expect(
        ((await send((_) => hubError(400, 'bad_request'))) as ReplyRejected)
            .unsafeText,
        isFalse,
      );
      expect(
        ((await send((_) => hubError(400, 'unsafe_text'))) as ReplyRejected)
            .unsafeText,
        isTrue,
      );
    });

    test('401 is unauthorized', () async {
      expect(
        await send((_) => hubError(401, 'unauthorized')),
        isA<ReplyUnauthorized>(),
      );
    });

    test('403 distinguishes replies_disabled from forbidden', () async {
      expect(
        ((await send((_) => hubError(403, 'replies_disabled')))
                as ReplyForbidden)
            .disabled,
        isTrue,
      );
      expect(
        ((await send((_) => hubError(403, 'forbidden'))) as ReplyForbidden)
            .disabled,
        isFalse,
      );
    });

    test('409 stale_item and idempotency_conflict are different', () async {
      expect(await send((_) => hubError(409, 'stale_item')), isA<ReplyStale>());
      expect(
        await send((_) => hubError(409, 'idempotency_conflict')),
        isA<ReplyKeyConflict>(),
      );
      expect(
        await send((_) => hubError(409, 'something_else')),
        isA<ReplyUnavailable>(),
      );
    });

    test('413 is too large', () async {
      expect(
        await send((_) => hubError(413, 'too_large')),
        isA<ReplyTooLarge>(),
      );
    });

    test('429 honours Retry-After in seconds, capped at an hour', () async {
      Future<Duration?> retry(String? header) async =>
          ((await send(
                    (_) => hubReply(
                      429,
                      body: utf8.encode('{"error":"rate_limited"}'),
                      headers: {'retry-after': ?header},
                    ),
                  ))
                  as ReplyRateLimited)
              .retryAfter;
      expect(await retry('120'), const Duration(seconds: 120));
      expect(await retry('999999'), const Duration(hours: 1));
      expect(await retry('Wed, 21 Oct 2026 07:28:00 GMT'), isNull);
      expect(await retry(null), isNull);
    });

    test('5xx and a malformed body are unavailable', () async {
      for (final status in [500, 502, 503]) {
        expect(
          await send((_) => hubError(status, 'storage_unavailable')),
          isA<ReplyUnavailable>(),
        );
      }
      expect(
        await send((_) => hubReply(500, body: [0xff])),
        isA<ReplyUnavailable>(),
      );
    });

    test('a redirect is not followed and is unavailable', () async {
      expect(await send((_) => hubReply(302)), isA<ReplyUnavailable>());
    });

    test('a network failure is unavailable', () async {
      expect(
        await send((_) => throw http.ClientException('offline')),
        isA<ReplyUnavailable>(),
      );
    });

    test(
      'a stalled hub times out as unavailable and aborts the request',
      () async {
        final hub = FakeHub((_) => Completer<http.StreamedResponse>().future);
        final transport = HubReplyTransport(
          baseUrl: hubBase,
          tokens: FakeTokens(),
          client: hub.client,
          timeout: const Duration(milliseconds: 50),
        );
        expect(await transport.send(_entry()), isA<ReplyUnavailable>());
        await pumpEventQueue();
        expect(hub.requests.single.aborted, isTrue);
      },
    );
  });

  group('session', () {
    test(
      '401 earns one silent refresh and a retry with the SAME key',
      () async {
        final hub = FakeHub(
          (r) => r.headers['Authorization'] == 'Bearer synthetic-token-2'
              ? _created()
              : hubError(401, 'unauthorized'),
        );
        final tokens = FakeTokens(refreshed: 'synthetic-token-2');
        expect(
          await _transport(hub, tokens).send(_entry()),
          isA<ReplyAccepted>(),
        );
        expect(tokens.refreshes, 1);
        expect(hub.requests, hasLength(2));
        expect(hub.requests.map((r) => r.headers['Idempotency-Key']).toSet(), {
          _key,
        });
      },
    );

    test('a second 401 is unauthorized without a third request', () async {
      final hub = FakeHub((_) => hubError(401, 'unauthorized'));
      final tokens = FakeTokens(refreshed: 'synthetic-token-2');
      expect(
        await _transport(hub, tokens).send(_entry()),
        isA<ReplyUnauthorized>(),
      );
      expect(hub.requests, hasLength(2));
    });

    test('no session at all is unauthorized with no request', () async {
      final hub = FakeHub((_) => _created());
      final tokens = FakeTokens(current: null);
      expect(
        await _transport(hub, tokens).send(_entry()),
        isA<ReplyUnauthorized>(),
      );
      expect(hub.requests, isEmpty);
    });

    test('a refresh that throws is unavailable, never access lost', () async {
      final hub = FakeHub((_) => hubError(401, 'unauthorized'));
      final tokens = FakeTokens()..refreshError = Exception('offline');
      expect(
        await _transport(hub, tokens).send(_entry()),
        isA<ReplyUnavailable>(),
      );
    });
  });
}
