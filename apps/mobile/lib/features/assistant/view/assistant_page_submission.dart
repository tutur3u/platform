part of 'assistant_page.dart';

extension _AssistantPageSubmission on _AssistantPageState {
  Future<void> _handleSend(String wsId) async {
    if (_localCubit.state.local || _localCubit.state.blocked) {
      await _sendLocal();
      return;
    }
    final guard = _remoteGuard(wsId);
    if (!guard.current) return;
    final shellState = _shellCubit.state;
    final chatState = _chatCubit.state;
    final liveState = _liveCubit.state;
    final operation = _remoteOperationGuard(wsId);
    final workspaceVersion = _chatCubit.attachmentScopeVersion;
    if (_chatCubit.state.workspaceId != wsId ||
        _chatCubit.state.status == AssistantChatStatus.restoring) {
      return;
    }
    bool liveReplyBlocked() =>
        _chatCubit.state.replyTarget != null &&
        _shouldSendThroughLive(_chatCubit.state, _liveCubit.state);
    if (liveReplyBlocked()) {
      _showInlineNotice(context.l10n.assistantReplyLiveUnavailable);
      return;
    }
    if (chatState.creationOutcomeUnknown &&
        chatState.storedChatId == null &&
        chatState.composerAttachments.isEmpty &&
        _inputController.text.trim().isNotEmpty) {
      final scope = _localScope();
      final draft = _inputController.value;
      final result = await _startNewConversation(
        wsId,
        chatState,
        liveState,
        preserveDraft: true,
      );
      if (result == _AssistantNewChatResult.committed &&
          mounted &&
          scope != null &&
          scope == _localScope() &&
          _inputController.value == draft) {
        await _handleSend(wsId);
      }
      return;
    }
    if (chatState.composerAttachments.any(
      (attachment) =>
          attachment.uploadState == AssistantAttachmentUploadState.uploading,
    )) {
      _showInlineNotice(context.l10n.assistantAttachmentUploadPending);
      return;
    }
    if (chatState.composerAttachments.any(
      (attachment) =>
          attachment.uploadState == AssistantAttachmentUploadState.error,
    )) {
      _showInlineNotice(context.l10n.assistantAttachmentUploadFailed);
      return;
    }

    final text = _inputController.text;
    final attachments = chatState.composerAttachments
        .where((attachment) => attachment.isUploaded)
        .toList(growable: false);
    if (text.trim().isEmpty && attachments.isEmpty) {
      return;
    }

    if (_shouldSendThroughLive(chatState, liveState)) {
      await _liveCubit.sendTypedMessage(
        wsId: wsId,
        text: text,
        attachments: attachments,
      );
      if (!guard.current ||
          !mounted ||
          _chatCubit.attachmentScopeVersion != workspaceVersion ||
          _liveCubit.state.status == AssistantLiveConnectionStatus.error) {
        return;
      }
      _chatCubit.takeUploadedComposerAttachments();
    } else {
      if (_chatCubit.replyBlockedByPendingSubmission) {
        _showInlineNotice(context.l10n.assistantReplyPending);
        return;
      }
      if (!await submitAssistantRemoteChat(
        _chatCubit,
        shellState,
        wsId: wsId,
        message: text,
        isCurrent: () =>
            guard.current &&
            _chatCubit.attachmentScopeVersion == workspaceVersion &&
            !liveReplyBlocked(),
        isOperationCurrent: () =>
            operation.current &&
            _chatCubit.attachmentScopeVersion == workspaceVersion &&
            !liveReplyBlocked(),
      )) {
        if (mounted && guard.current && liveReplyBlocked()) {
          _showInlineNotice(context.l10n.assistantReplyLiveUnavailable);
        }
        return;
      }
    }

    if (!operation.current ||
        !mounted ||
        _chatCubit.attachmentScopeVersion != workspaceVersion ||
        _chatCubit.state.replyTarget != null ||
        _inputController.text != text) {
      return;
    }

    _inputController.clear();
    _scheduleScrollToBottom();
  }
}
