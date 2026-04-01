import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_payload.dart';

void main() {
  group('normalizeTaskDescriptionPayload', () {
    test('returns null for blank payloads', () {
      expect(normalizeTaskDescriptionPayload('   '), isNull);
      expect(normalizeTaskDescriptionPayload('\n\n'), isNull);
    });

    test('preserves plain text payload', () {
      final payload = normalizeTaskDescriptionPayload('Task note');
      expect(payload, 'Task note');
    });

    test('preserves markdown payload', () {
      final payload = normalizeTaskDescriptionPayload(
        '## Heading\n\n- one\n- two',
      );
      expect(payload, '## Heading\n\n- one\n- two');
    });

    test('normalizes TipTap JSON payload', () {
      const raw = '''
      {
        "type":"doc",
        "content":[
          {
            "type":"paragraph",
            "content":[{"type":"text","text":"Hello"}]
          }
        ]
      }
      ''';

      final payload = normalizeTaskDescriptionPayload(raw);
      expect(payload, isNotNull);
      final decoded = jsonDecode(payload!) as Map<String, dynamic>;
      expect(decoded['type'], 'doc');
      expect(decoded['content'], isA<List<dynamic>>());
    });

    test('returns null for empty TipTap doc', () {
      const emptyDoc = '{"type":"doc","content":[]}';
      expect(normalizeTaskDescriptionPayload(emptyDoc), isNull);
    });
  });
}
