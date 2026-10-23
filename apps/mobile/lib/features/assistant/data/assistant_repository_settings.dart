part of 'assistant_repository.dart';

extension AssistantRepositorySettings on AssistantRepository {
  /// Direct, permission-checked HTTP; no outbox or optimistic ACK.
  Future<AssistantSettingsDisposition> acknowledgeSettingsSelection({
    required String actorId,
    required String wsId,
    required String chatId,
    required AssistantSettingsSelection selection,
    required bool Function() isCurrent,
  }) async {
    bool current() => currentActorId == actorId && isCurrent();
    if (!current()) return AssistantSettingsDisposition.stale;
    if (!isUuid(actorId) || !isUuid(wsId) || !isUuid(selection.creditWsId)) {
      return AssistantSettingsDisposition.denied;
    }
    _chatSettingsRevision++;
    try {
      final route = AssistantChatRoute.parse(chatId);
      if (route.kind != AssistantChatRouteKind.native) {
        return AssistantSettingsDisposition.denied;
      }
      final payload = await _apiClient.patchJsonAcknowledged(
        '/api/v1/workspaces/$wsId/chat/conversations/$chatId/ai-settings',
        selection.toJson(),
        actorId: actorId,
        isCurrent: current,
      );
      if (!current()) return AssistantSettingsDisposition.stale;
      requireAssistantSendSettings(
        payload,
        chatId: chatId,
        modelId: selection.modelId,
        creditSource: selection.creditSource.name,
        creditWsId: selection.creditWsId,
        thinkingMode: selection.thinkingMode.name,
      );
      return AssistantSettingsDisposition.acknowledged;
    } on ApiException catch (error) {
      if (!current()) return AssistantSettingsDisposition.stale;
      return const {401, 403}.contains(error.statusCode)
          ? AssistantSettingsDisposition.denied
          : AssistantSettingsDisposition.unknown;
    } on Object {
      return current()
          ? AssistantSettingsDisposition.unknown
          : AssistantSettingsDisposition.stale;
    } finally {
      _chatSettingsRevision++;
    }
  }
}
