part of 'assistant_chat_cubit.dart';

sealed class _PreparedChatSubmission { const _PreparedChatSubmission(); }
final class _SeparateCreatedChat extends _PreparedChatSubmission {
  const _SeparateCreatedChat(this.record);
  final AssistantChatRecord record;
}
final class _FirstMessagePreparedChat extends _PreparedChatSubmission {
  const _FirstMessagePreparedChat(this.creation);
  final AssistantFirstMessageCreation creation;
}

extension _AssistantChatCreationSubmission on AssistantChatCubit {
  Future<_PreparedChatSubmission?> _prepareChatSubmission({
    required String chatId, required String wsId, required String modelId,
    required String message, required String timezone, required bool hasAttachments,
    required bool Function() current, required void Function() onPersisting,
  }) async {
    final plan = _prepareCreationSettings?.call(wsId, modelId, current);
    if (_prepareCreationSettings != null && plan == null) {
      _unknownSubmission(_activeSubmissionRequestId, denied: true);
      _emitIfOpen(state.copyWith(status: AssistantChatStatus.idle));
      return null;
    }
    _emitIfOpen(state.copyWith(creationOutcomeUnknown: true));
    if (plan != null && !hasAttachments) {
      return _FirstMessagePreparedChat(AssistantFirstMessageCreation(plan.take(), plan.isCurrent));
    }
    final created = await _repository.createChat(
      id: chatId, wsId: wsId, modelId: modelId, message: message,
      timezone: timezone, initialSettings: plan?.take(), isCurrent: plan?.isCurrent,
    );
    if (!current()) return null;
    if (created is! AssistantCreatedChat) {
      onPersisting();
      await _preferences.saveChatId(wsId, created.id, shouldWrite: current);
    }
    if (!current()) return null;
    _emitIfOpen(state.copyWith(chat: created, storedChatId: created.id, creationOutcomeUnknown: false));
    unawaited(refreshHistory());
    return _SeparateCreatedChat(created);
  }

  Stream<AssistantStreamEvent> _replyForSubmission({
    required AssistantFirstMessageCreation? firstCreation,
    required String chatId, required String wsId,
    required String? workspaceContextId, required String modelId,
    required List<AssistantMessage> messages,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource, required String timezone,
    required List<AssistantAttachment> attachments,
    required ApiMutationAdmission admission, String? creditWsId,
  }) => firstCreation == null ? _repository.streamChat(
    chatId: chatId, wsId: wsId, workspaceContextId: workspaceContextId,
    modelId: modelId, messages: messages, thinkingMode: thinkingMode,
    creditSource: creditSource, timezone: timezone, attachments: attachments,
    creditWsId: creditWsId, admission: admission,
  ) : _repository.streamFirstChat(
    creation: firstCreation, chatId: chatId, wsId: wsId, messages: messages,
    timezone: timezone, admission: admission,
  );
}
