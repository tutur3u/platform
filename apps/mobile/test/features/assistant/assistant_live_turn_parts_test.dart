import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_history_parts.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_parts.dart';

void main() {
  test('provider text and tools retain receipt order through persistence', () {
    final turn = AssistantLiveTurnParts()..appendText('', 'Before');
    final tool = turn.beginTool(id: 'one', name: 'search_tasks', args: {});
    turn
      ..appendText('Before', 'BeforeAfter')
      ..completeTool(tool, {'result': 'Found'});
    final restored = restoreAssistantHistoryParts('BeforeAfter', {
      'source': 'ai-chat',
      'metadata': {'parts': turn.toJson()},
    });
    expect(restored.map((p) => p.type), ['text', 'dynamic-tool', 'text']);
    expect(restored.first.text, 'Before');
    expect(restored[1].output, {'result': 'Found'});
    expect(restored.last.text, 'After');
  });
  test('transcription is used without duplicating the text channel', () {
    final turn = AssistantLiveTurnParts()
      ..appendText('', 'Spoken', transcript: true)
      ..appendText('', 'Spoken');
    expect(turn.parts.length, 1);
    expect(turn.parts.single.text, 'Spoken');
    turn.appendText('Spoken', 'Spoken');
    expect(turn.parts.single.text, 'Spoken');
  });
  test('tool completion cannot mutate a previously published snapshot', () {
    final turn = AssistantLiveTurnParts();
    final tool = turn.beginTool(id: 'one', name: 'search', args: {});
    final snapshot = turn.toJson();
    turn.completeTool(tool, {'ok': true});
    expect(snapshot.single['state'], 'input-available');
    expect(snapshot.single.containsKey('output'), false);
    expect(turn.parts.single.state, 'output-available');
  });
  test('malformed ordered metadata falls back to legacy tools and text', () {
    final parts = restoreAssistantHistoryParts('Answer', {
      'parts': [
        {'type': 'text', 'text': 7},
      ],
      'toolCalls': [
        {
          'toolCallId': 'one',
          'toolName': 'search',
          'args': <String, dynamic>{},
        },
      ],
      'toolResults': [
        {
          'toolCallId': 'one',
          'result': {'ok': true},
        },
      ],
    });
    expect(parts.map((p) => p.type), ['text', 'dynamic-tool']);
    expect(parts.last.output, {'ok': true});
  });
  test('arbitrary nested metadata does not replace the direct history', () {
    expect(
      restoreAssistantHistoryParts('Visible', {
        'metadata': {
          'parts': [
            {'type': 'text', 'text': 'Other'},
          ],
        },
      }).single.text,
      'Visible',
    );
  });
}
