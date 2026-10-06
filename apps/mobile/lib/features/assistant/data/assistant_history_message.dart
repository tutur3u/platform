import 'package:mobile/features/assistant/data/assistant_history_parts.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

AssistantMessage restoreAssistantChatMessage(ChatMessage message) =>
    AssistantMessage(
      id: message.id,
      role: switch (message.kind) {
        ChatMessageKind.assistant => 'assistant',
        ChatMessageKind.system => 'system',
        ChatMessageKind.user => 'user',
      },
      parts: restoreAssistantHistoryParts(message.content, message.metadata),
      createdAt: message.createdAt,
      liveTurnId: message.metadata['liveTurnId'] as String?,
    );
