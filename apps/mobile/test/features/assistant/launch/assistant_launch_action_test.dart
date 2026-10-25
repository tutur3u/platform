import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_action.dart';

void main() {
  final received = DateTime(2026, 10, 25, 12);

  AssistantLaunchAction? parse(Object? raw) =>
      AssistantLaunchAction.fromNative(raw, receivedAt: received);

  test('parses a trusted iOS voice action', () {
    final created = received.subtract(const Duration(seconds: 2));
    final action = parse({
      'id': 'a',
      'kind': 'voice',
      'trusted': true,
      'createdAtMs': created.millisecondsSinceEpoch,
      'prompt': 'ignored for voice',
    })!;
    expect(action.kind, AssistantLaunchKind.voice);
    expect(action.trusted, isTrue);
    expect(action.createdAt, created);
    expect(action.prompt, isNull);
    expect(action.autoSendPrompt, isFalse);
  });

  test('missing trust flag is untrusted and never auto-sends', () {
    final action = parse({'id': 'a', 'kind': 'prompt', 'prompt': ' hi '})!;
    expect(action.trusted, isFalse);
    expect(action.prompt, 'hi');
    expect(action.autoSendPrompt, isFalse);
  });

  test('trusted prompt auto-sends; blank prompt only opens the composer', () {
    expect(
      parse({
        'id': 'a',
        'kind': 'prompt',
        'trusted': true,
        'prompt': 'plan my day',
      })!.autoSendPrompt,
      isTrue,
    );
    final blank = parse({
      'id': 'b',
      'kind': 'prompt',
      'trusted': true,
      'prompt': '   ',
    })!;
    expect(blank.prompt, isNull);
    expect(blank.autoSendPrompt, isFalse);
  });

  test('bounds prompt length and future timestamps', () {
    final action = parse({
      'id': 'a',
      'kind': 'prompt',
      'prompt': 'x' * (AssistantLaunchAction.maxPromptLength + 5),
      'createdAtMs': received
          .add(const Duration(hours: 1))
          .millisecondsSinceEpoch,
    })!;
    expect(action.prompt!.length, AssistantLaunchAction.maxPromptLength);
    expect(action.createdAt, received);
  });

  test('drops malformed payloads', () {
    expect(parse(null), isNull);
    expect(parse('voice'), isNull);
    expect(parse({'kind': 'voice'}), isNull);
    expect(parse({'id': '', 'kind': 'voice'}), isNull);
    expect(parse({'id': 'a', 'kind': 'camera'}), isNull);
    expect(parse({'id': 'x' * 129, 'kind': 'voice'}), isNull);
  });
}
