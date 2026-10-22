import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_history_parts.dart';

void main() {
  for (final wrapped in [false, true]) {
    test('restores completed ai.parts with full text (wrapped=$wrapped)', () {
      final reply = '${'a' * 10000}Final answer';
      final metadata = <String, dynamic>{
        'ai': {
          'contentTruncated': true,
          'parts': [
            {'type': 'text', 'text': reply},
            {
              'type': 'dynamic-tool',
              'toolCallId': 'lookup',
              'toolName': 'search',
              'state': 'output-available',
              'output': {'ok': true},
            },
            {'type': 'source-url', 'url': 'https://example.com/source'},
          ],
        },
      };
      final restored = restoreAssistantHistoryParts(
        reply.substring(0, 10000),
        wrapped ? {'source': 'ai-chat', 'metadata': metadata} : metadata,
      );
      expect(restored.map((part) => part.type), [
        'text',
        'dynamic-tool',
        'source-url',
      ]);
      expect(restored.first.text, reply);
      expect(restored[1].output, {'ok': true});
      expect(restored.last.url, 'https://example.com/source');
    });
  }

  test('rehydrates compact text offsets in provider order', () {
    final restored = restoreAssistantHistoryParts('Before\n\nAfter', {
      'ai': {
        'parts': [
          {'type': 'text', 'textStart': 0, 'textLength': 6},
          {'type': 'step-start'},
          {'type': 'text', 'textStart': 8, 'textLength': 5},
        ],
      },
    });
    expect(restored.map((part) => part.text), ['Before', null, 'After']);
  });

  test('invalid compact offsets fall back to persisted content', () {
    for (final start in [-1, 100]) {
      final restored = restoreAssistantHistoryParts('Answer', {
        'ai': {
          'parts': [
            {'type': 'text', 'textStart': start, 'textLength': 6},
          ],
        },
      });
      expect(restored.single.text, 'Answer');
    }
  });
}
