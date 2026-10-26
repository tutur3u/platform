import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_created_chat.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import '../cubit/assistant_chat_creation_harness.dart' as creation;

void main() {
  test(
    'the repository returns a created chat only after retaining selection',
    () async {
      final h = creation.CreationHarness();
      await h.setup();
      addTearDown(h.close);
      h.response.complete(h.receipt());
      final created = await h.repository.createChat(
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        wsId: creation.ws,
        modelId: 'model',
        message: 'First turn',
        timezone: 'Asia/Ho_Chi_Minh',
      );
      expect(created, isA<AssistantCreatedChat>());
      final preferences = AssistantPreferences(currentUserId: () => h.actor.id);
      expect(await preferences.loadChatId(creation.ws), created.id);
      expect(await h.repository.hasUnknownChatCreation(creation.ws), isFalse);
      // Cache decoding cannot inherit the durable creation result.
      expect(
        AssistantChatRecord.fromJson(created.toJson()),
        isNot(isA<AssistantCreatedChat>()),
      );
    },
  );
}
