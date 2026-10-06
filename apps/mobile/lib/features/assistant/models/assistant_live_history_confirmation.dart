import 'package:mobile/features/assistant/models/assistant_models.dart';

typedef AssistantLiveTurnConfirmation =
    bool Function(
      String workspaceId,
      String chatId,
      String turnId,
      Set<String> expectedRoles,
    );

/// A write receipt does not confirm that restored history displays a turn.
bool isAssistantLiveTurnHistoryConfirmed({
  required String? loadedWorkspaceId,
  required String? loadedConversationId,
  required bool restoreSucceeded,
  required List<AssistantMessage> messages,
  required String workspaceId,
  required String conversationId,
  required String turnId,
  required Set<String> expectedRoles,
}) {
  if (!restoreSucceeded ||
      loadedWorkspaceId != workspaceId ||
      loadedConversationId != conversationId ||
      expectedRoles.isEmpty) {
    return false;
  }
  final restoredRoles = messages
      .where((message) => message.liveTurnId == turnId)
      .map((message) => message.role)
      .toSet();
  return restoredRoles.containsAll(expectedRoles);
}
