import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';

void main() {
  group('AssistantSseParser', () {
    test('parses streamed json events and done marker', () {
      final parser = AssistantSseParser();

      final firstChunk = utf8.encode(
        'data: {"type":"start","messageId":"msg-1"}\n\n'
        'data: {"type":"text-delta","id":"text-1","delta":"Hello"}\n\n',
      );
      final secondChunk = utf8.encode('data: [DONE]\n\n');

      final firstEvents = parser.addChunk(firstChunk);
      final secondEvents = parser.addChunk(secondChunk);

      expect(firstEvents, hasLength(2));
      expect(firstEvents.first, isA<AssistantJsonStreamEvent>());
      expect(
        (firstEvents.first as AssistantJsonStreamEvent).payload['type'],
        'start',
      );
      expect(
        (firstEvents[1] as AssistantJsonStreamEvent).payload['delta'],
        'Hello',
      );
      expect(secondEvents.single, isA<AssistantDoneStreamEvent>());
    });

    test('buffers partial frames between chunks', () {
      final parser = AssistantSseParser();

      final firstEvents = parser.addChunk(
        utf8.encode('data: {"type":"text-delta","id":"text-1",'),
      );
      final secondEvents = parser.addChunk(
        utf8.encode('"delta":"Hi"}\n\n'),
      );

      expect(firstEvents, isEmpty);
      expect(secondEvents, hasLength(1));
      expect(
        (secondEvents.single as AssistantJsonStreamEvent).payload['delta'],
        'Hi',
      );
    });
  });
}
