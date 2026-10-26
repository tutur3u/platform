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
    final failedAttachments = chatState.composerAttachments
        .where(
          (attachment) =>
              attachment.uploadState == AssistantAttachmentUploadState.error,
        )
        .toList(growable: false);
    if (failedAttachments.isNotEmpty) {
      // Name the reason: "retry" only helps connection and server failures.
      _showInlineNotice(
        failedAttachments.length == 1
            ? context.l10n.assistantAttachmentNotSentOne(
                failedAttachments.single.name,
                assistantAttachmentFailureMessage(
                  context,
                  failedAttachments.single.failure,
                ),
              )
            : context.l10n.assistantAttachmentNotSentMany(
                failedAttachments.length,
              ),
      );
      return;
    }

    final text = _inputController.text;
    final attachments = chatState.composerAttachments
        .where((attachment) => attachment.isUploaded)
        .toList(growable: false);
    if (text.trim().isEmpty && attachments.isEmpty) {
      return;
    }
    final throughLive = _shouldSendThroughLive(chatState, liveState);
    if (!throughLive && _chatCubit.replyBlockedByPendingSubmission) {
      _showInlineNotice(context.l10n.assistantReplyPending);
      return;
    }
    // Only an admitted send takes the operation lease: a rapid second tap
    // finds the composer already empty and must not retire the first send.
    final operation = _remoteOperationGuard(wsId);
    final draftValue = _inputController.value;
    _transcriptFollower.resume();
    // A chat send empties the composer the moment the user sends; acceptance
    // is awaited separately and only an unaccepted send gives the draft back.
    // Live keeps its draft until dispatch so its #6664 fences still apply.
    if (!throughLive) _inputController.clear();
    // An unsent draft returns even across a scope change, as the composer
    // kept it before; text the user typed since then is never overwritten.
    void restoreDraft() {
      if (!mounted || _inputController.text.isNotEmpty) return;
      _inputController.value = draftValue;
    }

    if (throughLive) {
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
      if (!mounted) return;
      if (!current()) {
        final selected = _chatCubit.state;
        if ((dispatch == AssistantLiveDispatch.dispatched ||
                dispatch == AssistantLiveDispatch.unknown) &&
            guard.current &&
            operation.current &&
            context.read<WorkspaceCubit>().state.currentWorkspace?.id == wsId &&
            _chatCubit.selectedConversationId == chatState.storedChatId &&
            selected.chat?.id == chatState.chat?.id &&
            selected.storedChatId == chatState.storedChatId) {
          _showInlineNotice(context.l10n.assistantLiveSendUnknown);
        }
        return;
      }
      switch (dispatch) {
        case AssistantLiveDispatch.dispatched:
          _chatCubit.takeUploadedComposerAttachments(matching: attachments);
          if (_inputController.text == text) _inputController.clear();
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
        restoreDraft();
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
        _chatCubit.attachmentScopeVersion != workspaceVersion) {
      return;
    }
    _scheduleScrollToBottom();
  }
}
