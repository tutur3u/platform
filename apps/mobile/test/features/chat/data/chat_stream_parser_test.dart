import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';

void main() {
  group('ChatNdjsonStreamParser', () {
    test('parses message, assistant delta, and done events', () {
      final parser = ChatNdjsonStreamParser();
      final messageEvent = jsonEncode({
        'type': 'message',
        'message': {
          'id': 'm1',
          'conversationId': 'c1',
          'content': 'Hi',
          'kind': 'user',
          'attachments': <Object?>[],
          'metadata': <String, Object?>{},
          'reactions': <Object?>[],
          'senderId': 'u1',
          'sender': null,
          'replyToMessageId': null,
          'createdAt': '2026-05-31T00:00:00.000Z',
          'updatedAt': null,
          'editedAt': null,
          'deletedAt': null,
        },
      });

      final events = parser.addChunk(
        utf8.encode(
          '$messageEvent\n'
          '{"type":"assistant_delta","delta":"Hello"}\n'
          '{"type":"done"}\n',
        ),
      );

      expect(events, hasLength(3));
      expect(events[0], isA<ChatStreamMessageEvent>());
      expect((events[0] as ChatStreamMessageEvent).message.id, 'm1');
      expect(events[1], isA<ChatStreamAssistantDeltaEvent>());
      expect((events[1] as ChatStreamAssistantDeltaEvent).delta, 'Hello');
      expect(events[2], isA<ChatStreamDoneEvent>());
    });

    test('buffers partial ndjson rows across chunks', () {
      final parser = ChatNdjsonStreamParser();

      expect(
        parser.addChunk(utf8.encode('{"type":"assistant_delta",')),
        isEmpty,
      );
      final events = parser.addChunk(utf8.encode('"delta":"Hi"}\n'));

      expect(events.single, isA<ChatStreamAssistantDeltaEvent>());
      expect((events.single as ChatStreamAssistantDeltaEvent).delta, 'Hi');
    });
  });
}
