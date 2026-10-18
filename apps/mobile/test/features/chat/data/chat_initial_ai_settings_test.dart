import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/data/chat_creation_receipt.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';

const actor = '33333333-3333-4333-8333-333333333333';
const ws = '22222222-2222-4222-8222-222222222222';
const chat = '44444444-4444-4444-8444-444444444444';
void main() {
  for (final source in ['personal', 'workspace']) {
    for (final credit in [null, ws]) {
      test('$source explicit nullable scope is matched exactly', () {
        final settings = ChatInitialAiSettings(
          modelId: 'google/test',
          creditSource: source,
          creditWsId: credit,
          thinkingMode: 'fast',
        );
        final receipt = {
          'conversation': {
            'id': chat,
            'wsId': ws,
            'type': 'ai',
            'createdBy': actor,
            'createdAt': '2026-10-18T00:00:00Z',
            'initialAiSettings': {
              ...settings.toJson(),
              'actorUserId': actor,
              'wsId': ws,
              'conversationId': chat,
            },
          },
        };
        expect(
          AcknowledgedChatConversation.fromResponse(
            receipt,
            wsId: ws,
            actorId: actor,
            initialSettings: settings,
          ).conversation.id,
          chat,
        );
        final other = ChatInitialAiSettings(
          modelId: settings.modelId,
          creditSource: source,
          creditWsId: credit == null ? ws : null,
          thinkingMode: 'fast',
        );
        expect(
          () => AcknowledgedChatConversation.fromResponse(
            receipt,
            wsId: ws,
            actorId: actor,
            initialSettings: other,
          ),
          throwsFormatException,
        );
      });
    }
  }
  test(
    'missing nullable field is malformed rather than silently defaulted',
    () {
      expect(
        () => ChatInitialAiSettings.fromJson({
          'modelId': 'google/test',
          'creditSource': 'workspace',
          'thinkingMode': 'fast',
        }),
        throwsFormatException,
      );
    },
  );
}
