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
    final submittedReplyId = chatState.replyTarget?.id;
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

    final draft = _inputController.value;
    final text = draft.text;
    final attachments = chatState.composerAttachments
        .where((attachment) => attachment.isUploaded)
        .toList(growable: false);
    if (text.trim().isEmpty && attachments.isEmpty) {
      return;
    }

    if (_shouldSendThroughLive(chatState, liveState)) {
      var liveWorkspaceVersion = workspaceVersion;
      bool current() =>
          guard.current &&
          operation.current &&
          context.read<WorkspaceCubit>().state.currentWorkspace?.id == wsId &&
          _chatCubit.attachmentScopeVersion == liveWorkspaceVersion;
      final dispatch = await _liveCubit.sendTypedMessage(
        wsId: wsId,
        text: text,
        attachments: attachments,
        isCurrent: current,
        onChatBound: (boundWorkspace, liveChatId) async {
          if (!current()) return;
          final canonicalId = assistantLiveConversationId(liveChatId);
          final selected = _chatCubit.state;
          final sameCanonicalSelection =
              boundWorkspace == wsId &&
              selected.workspaceId == wsId &&
              selected.chat?.id == canonicalId &&
              selected.storedChatId == canonicalId;
          final binding = _chatCubit.openChatById(boundWorkspace, canonicalId);
          // Only this invocation's exact canonical rebind may renew its lease.
          // Native IDs sharing the UUID still require a different-store bind.
          if (sameCanonicalSelection &&
              _chatCubit.attachmentScopeVersion == liveWorkspaceVersion + 1) {
            liveWorkspaceVersion++;
          }
          await binding;
        },
      );
      if (!mounted || !current()) return;
      switch (dispatch) {
        case AssistantLiveDispatch.dispatched:
          _chatCubit.takeUploadedComposerAttachments(matching: attachments);
          if (_inputController.value == draft) _inputController.clear();
          _scheduleScrollToBottom();
        case AssistantLiveDispatch.refused:
          _showInlineNotice(context.l10n.assistantLiveSendRefused);
        case AssistantLiveDispatch.unknown:
          _showInlineNotice(context.l10n.assistantLiveSendUnknown);
        case AssistantLiveDispatch.stale:
          break;
      }
      return;
    } else {
      if (_chatCubit.replyBlockedByPendingSubmission) {
        _showInlineNotice(context.l10n.assistantReplyPending);
        return;
      }
      var replyChangedBeforeSubmission = false;
      if (!await submitAssistantRemoteChat(
        _chatCubit,
        shellState,
        wsId: wsId,
        message: text,
        isCurrent: () {
          if (!guard.current ||
              context.read<WorkspaceCubit>().state.currentWorkspace?.id !=
                  wsId ||
              _chatCubit.attachmentScopeVersion != workspaceVersion) {
            return false;
          }
          if (_chatCubit.state.replyTarget?.id != submittedReplyId) {
            replyChangedBeforeSubmission = true;
            return false;
          }
          return !_shouldSendThroughLive(_chatCubit.state, _liveCubit.state);
        },
        isOperationCurrent: () =>
            operation.current &&
            _chatCubit.attachmentScopeVersion == workspaceVersion,
      )) {
        if (mounted &&
            guard.current &&
            operation.current &&
            context.read<WorkspaceCubit>().state.currentWorkspace?.id == wsId &&
            _chatCubit.attachmentScopeVersion == workspaceVersion) {
          if (liveReplyBlocked()) {
            _showInlineNotice(context.l10n.assistantReplyLiveUnavailable);
          } else if (replyChangedBeforeSubmission) {
            _showInlineNotice(context.l10n.assistantReplyChangedBeforeSend);
          }
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
