import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

/// Constructed only from the body of a successful direct creation response.
/// Offline placeholders never cross this boundary.
final class AcknowledgedChatConversation {
  const AcknowledgedChatConversation._(this.conversation);
  factory AcknowledgedChatConversation.fromResponse(
    Object? response, {
    required String wsId,
  }) {
    if (response is! Map<String, dynamic>) {
      throw const FormatException('Invalid chat creation response');
    }
    final raw = response['conversation'];
    if (raw is! Map<String, dynamic>) {
      throw const FormatException('Missing chat creation receipt');
    }
    final id = raw['id'];
    final workspace = raw['wsId'];
    final createdAt = raw['createdAt'];
    if (id is! String ||
        !isUuid(id) ||
        id.trim() != id ||
        workspace is! String ||
        !isUuid(workspace) ||
        workspace.trim() != workspace ||
        workspace != wsId ||
        raw['type'] != 'ai' ||
        (raw['title'] != null && raw['title'] is! String) ||
        (raw['description'] != null && raw['description'] is! String) ||
        (raw['aiEnabled'] != null && raw['aiEnabled'] is! bool) ||
        (raw['ai_enabled'] != null && raw['ai_enabled'] is! bool) ||
        createdAt is! String ||
        !RegExp(
          r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$',
        ).hasMatch(createdAt) ||
        DateTime.tryParse(createdAt) == null ||
        raw['archivedAt'] != null) {
      throw const FormatException('Invalid durable chat creation receipt');
    }
    final wallClock = DateTime.tryParse(
      createdAt.replaceFirst(RegExp(r'(Z|[+-]\d{2}:\d{2})$'), ''),
    );
    if (wallClock == null ||
        wallClock.toIso8601String().substring(0, 19) !=
            createdAt.substring(0, 19)) {
      throw const FormatException('Invalid chat creation timestamp');
    }
    try {
      return AcknowledgedChatConversation._(ChatConversation.fromJson(raw));
    } on Object {
      throw const FormatException('Invalid chat creation model fields');
    }
  }
  final ChatConversation conversation;
}
