import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

const _receipt =
    '{"type":"messages","messages":[{'
    '"id":"33333333-3333-4333-8333-333333333333",'
    '"conversationId":"22222222-2222-4222-8222-222222222222",'
    '"kind":"assistant",'
    '"createdAt":"2026-10-25T00:00:00Z","metadata":{},'
    '"content":"Saved answer"}]}\n{"type":"done"}\n';

Future<Map<String, dynamic>> _sentPayload({
  required bool miraMode,
  required Future<String> Function() deviceTimezone,
}) async {
  final api = _Api();
  Map<String, dynamic>? sent;
  when(
    () => api.sendJsonStream(
      'POST',
      '/api/v1/workspaces/ws/chat/conversations/chat/messages',
      any(),
      accept: 'application/x-ndjson',
    ),
  ).thenAnswer((invocation) async {
    sent = Map<String, dynamic>.from(invocation.positionalArguments[2] as Map);
    return http.StreamedResponse(
      Stream.value(utf8.encode(_receipt)),
      201,
      headers: {'content-type': 'application/x-ndjson'},
    );
  });

  await ChatRepository(apiClient: api, deviceTimezone: deviceTimezone)
      .sendMessageStream(
        'ws',
        'chat',
        content: 'Plan my day',
        miraMode: miraMode,
      )
      .drain<void>();
  return sent!;
}

void main() {
  test('Mira sends include the verified device timezone', () async {
    final payload = await _sentPayload(
      miraMode: true,
      deviceTimezone: () async => 'Asia/Ho_Chi_Minh',
    );

    expect(payload['miraMode'], isTrue);
    expect(payload['timezone'], 'Asia/Ho_Chi_Minh');
  });

  test('an unavailable device timezone is omitted, not sent as UTC', () async {
    final payload = await _sentPayload(
      miraMode: true,
      deviceTimezone: () async => throw Exception('no native zone'),
    );

    expect(payload.containsKey('timezone'), isFalse);
  });

  test('non-Mira sends do not read or send the device timezone', () async {
    var reads = 0;
    final payload = await _sentPayload(
      miraMode: false,
      deviceTimezone: () async {
        reads++;
        return 'Asia/Ho_Chi_Minh';
      },
    );

    expect(reads, 0);
    expect(payload.containsKey('timezone'), isFalse);
  });
}
