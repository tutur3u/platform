part of 'assistant_page.dart';

extension _AssistantPageSubmission on _AssistantPageState {
  Future<void> _handleSend(
    String wsId,
    AssistantShellState shellState,
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) async {
    if (_localCubit.state.local || _localCubit.state.blocked) {
      await _sendLocal();
      return;
    }
    final guard = _remoteGuard(wsId);
    if (!guard.current) return;
    final operation = _remoteOperationGuard(wsId);
    final workspaceVersion = _chatCubit.attachmentScopeVersion;
    if (_chatCubit.state.workspaceId != wsId ||
        _chatCubit.state.status == AssistantChatStatus.restoring) {
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
      if (!await submitAssistantRemoteChat(
        _chatCubit,
        shellState,
        wsId: wsId,
        message: text,
        isCurrent: () =>
            guard.current &&
            _chatCubit.attachmentScopeVersion == workspaceVersion,
        isOperationCurrent: () =>
            operation.current &&
            _chatCubit.attachmentScopeVersion == workspaceVersion,
      )) {
        return;
      }
    }

    if (!operation.current ||
        !mounted ||
        _chatCubit.attachmentScopeVersion != workspaceVersion ||
        _inputController.text != text) {
      return;
    }

    _inputController.clear();
    _scheduleScrollToBottom();
  }
}
