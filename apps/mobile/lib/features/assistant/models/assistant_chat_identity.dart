import 'package:mobile/core/validation/uuid.dart';

/// Live APIs use the AI chat UUID; unified chat APIs namespace those records.
String? assistantLiveChatUuid(String? id) {
  if (id == null) return null;
  for (final prefix in ['ai-chat-', 'legacy-ai-']) {
    if (id.startsWith(prefix)) {
      return normalizeUuid(id.substring(prefix.length));
    }
  }
  return normalizeUuid(id);
}

String assistantLiveConversationId(String id) {
  final uuid = assistantLiveChatUuid(id);
  if (uuid == null) throw ArgumentError.value(id, 'id', 'Invalid Live chat');
  return 'ai-chat-$uuid';
}

bool isSameAssistantLiveChat(String? conversationId, String? liveChatId) {
  final uuid = assistantLiveChatUuid(conversationId);
  return uuid != null && uuid == assistantLiveChatUuid(liveChatId);
}
