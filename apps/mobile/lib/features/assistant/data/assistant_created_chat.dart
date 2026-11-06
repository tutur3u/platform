import 'package:mobile/features/assistant/models/assistant_models.dart';

/// A creation result whose selection was durably saved before it was returned.
/// History/cache decoding deliberately produces ordinary [AssistantChatRecord]s.
final class AssistantCreatedChat extends AssistantChatRecord {
  const AssistantCreatedChat({
    required super.id,
    super.title,
    super.model,
    super.createdAt,
  });
}
