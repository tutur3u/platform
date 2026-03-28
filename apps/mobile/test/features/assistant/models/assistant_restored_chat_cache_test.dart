import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

void main() {
  group('AssistantRestoredChat cache JSON', () {
    test('round-trips chat, messages, and attachments', () {
      final original = AssistantRestoredChat(
        chat: AssistantChatRecord(
          id: 'c1',
          title: 'Hello',
          model: 'm1',
          createdAt: DateTime.utc(2025, 1, 2, 3, 4, 5),
        ),
        messages: [
          AssistantMessage(
            id: 'u1',
            role: 'user',
            parts: const [
              AssistantMessagePart(type: 'text', text: 'Hi'),
            ],
            createdAt: DateTime.utc(2025, 1, 2, 3, 5),
          ),
        ],
        attachmentsByMessageId: const {
          'u1': [
            AssistantAttachment(
              id: 'a1',
              name: 'x.png',
              size: 10,
              type: 'image/png',
              storagePath: 'p/x',
              signedUrl: 'https://example.com/x',
              uploadState: AssistantAttachmentUploadState.uploaded,
            ),
          ],
        },
      );

      final json = original.toJson();
      final decoded = AssistantRestoredChat.fromJson(json);

      expect(decoded.chat?.id, original.chat?.id);
      expect(decoded.chat?.title, original.chat?.title);
      expect(decoded.messages.length, 1);
      expect(decoded.messages.first.parts.first.text, 'Hi');
      expect(decoded.attachmentsByMessageId['u1']?.length, 1);
      expect(decoded.attachmentsByMessageId['u1']?.first.name, 'x.png');
    });
  });
}
