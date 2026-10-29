import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:mobile/features/mastermind/asks/ask_detail_source.dart';

import '../../../helpers/mastermind_ask_details_fixture.dart';
import '../../../helpers/mastermind_hub_harness.dart';
import '../../../helpers/mastermind_replies_fixture.dart';

void main() {
  test('is off by default: no source without the flag', () {
    expect(mastermindAskDetailsEnabled, isFalse);
    expect(createMastermindAskDetailSource(hubUrl: hubBase), isNull);
  });

  test('GETs /v1/asks/<id> with the bearer token, no redirects', () async {
    late final Uri url;
    late final String method;
    late final bool followRedirects;
    final headers = <String, String>{};
    final client = MockClient.streaming((request, _) async {
      url = request.url;
      method = request.method;
      followRedirects = request.followRedirects;
      headers.addAll(request.headers);
      return hubReply(
        200,
        body: utf8.encode(jsonEncode(askDetailBody(inboxItemId(1)))),
      );
    });
    final source = HubAskDetailSource(
      baseUrl: hubBase,
      tokens: FakeTokens(),
      client: client,
    );
    final fetch = await source.fetch(inboxItemId(1));
    expect(fetch, isA<AskDetailFound>());
    expect(method, 'GET');
    expect(
      url.toString(),
      'https://hub.example.test/v1/asks/${inboxItemId(1)}',
    );
    expect(headers['Authorization'], 'Bearer synthetic-token-1');
    expect(followRedirects, isFalse);
  });

  test('404 is withheld; 403 and 5xx keep the snapshot view', () async {
    Future<AskDetailFetch> status(int code) => HubAskDetailSource(
      baseUrl: hubBase,
      tokens: FakeTokens(),
      client: MockClient.streaming((_, _) async => hubError(code, 'x')),
    ).fetch(inboxItemId(5));
    expect(await status(404), isA<AskDetailWithheld>());
    expect(await status(403), isA<AskDetailUnavailable>());
    expect(await status(500), isA<AskDetailUnavailable>());
  });

  test('a 401 earns one silent refresh and retry', () async {
    final tokens = FakeTokens(refreshed: 'synthetic-token-2');
    final seen = <String?>[];
    final source = HubAskDetailSource(
      baseUrl: hubBase,
      tokens: tokens,
      client: MockClient.streaming((request, _) async {
        seen.add(request.headers['Authorization']);
        return seen.length == 1
            ? hubError(401, 'unauthorized')
            : hubReply(
                200,
                body: utf8.encode(jsonEncode(askDetailBody(inboxItemId(1)))),
              );
      }),
    );
    expect(await source.fetch(inboxItemId(1)), isA<AskDetailFound>());
    expect(seen, ['Bearer synthetic-token-1', 'Bearer synthetic-token-2']);
    expect(tokens.refreshes, 1);
  });

  test('another id, a malformed or an oversized body is unavailable', () async {
    Future<AskDetailFetch> body(List<int> bytes) => HubAskDetailSource(
      baseUrl: hubBase,
      tokens: FakeTokens(),
      client: MockClient.streaming((_, _) async => hubReply(200, body: bytes)),
    ).fetch(inboxItemId(1));
    expect(
      await body(utf8.encode(jsonEncode(askDetailBody(inboxItemId(2))))),
      isA<AskDetailUnavailable>(),
    );
    expect(await body(utf8.encode('not json')), isA<AskDetailUnavailable>());
    expect(
      await body(List.filled(HubAskDetailSource.maxBytes + 1, 32)),
      isA<AskDetailUnavailable>(),
    );
  });

  test('never requests an id that is not an item id', () async {
    var calls = 0;
    final source = HubAskDetailSource(
      baseUrl: hubBase,
      tokens: FakeTokens(),
      client: MockClient.streaming((_, _) async {
        calls++;
        return hubReply(200);
      }),
    );
    expect(await source.fetch('../v1/replies'), isA<AskDetailUnavailable>());
    expect(calls, 0);
  });
}
