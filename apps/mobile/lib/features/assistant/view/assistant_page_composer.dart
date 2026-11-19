part of 'assistant_page.dart';

extension _AssistantPageComposer on _AssistantPageState {
  Widget _buildComposer({
    required BuildContext context,
    required String wsId,
    required AssistantChatState chatState,
    required AssistantLiveState liveState,
    required AssistantLiveUiState liveUiState,
    required AssistantShellState shellState,
    required AssistantLocalChatState local,
    required bool isPersonalWorkspace,
    required bool localLane,
    required AssistantChromeState chrome,
    required bool Function() messageActionsCurrent,
    required Future<void> Function(String) removeComposerAttachment,
    required Future<void> Function(String) retryComposerAttachment,
    required bool showSuggestions,
  }) {
    final primary = AssistantComposerPrimaryAction(
      key: const ValueKey('assistant-dock-primary'),
      inPage: true,
      controller: _inputController,
      focusNode: _inputFocusNode,
      onToggleNavigation: _toggleComposerNavigation,
      onSend: () => _handleSend(wsId),
      voiceCapture: localLane ? null : _voiceCapture,
      onMicrophoneTap: localLane ? null : () => _recordVoiceMessage(wsId),
      onSendVoice: () => _finishVoiceRecording(sendNow: true),
      hasAttachments: chatState.composerAttachments.isNotEmpty,
      blocked:
          (localLane && (!local.ready || local.phase != LocalChatPhase.idle)) ||
          chatState.status == AssistantChatStatus.restoring,
      localGenerating: localLane && local.phase == LocalChatPhase.generating,
      onStopLocal: _localCubit.stop,
    );
    final composer = AssistantComposerDock(
      embedded: true,
      inPage: true,
      pagePrimaryAction: primary,
      onCancelReply: () {
        if (messageActionsCurrent()) {
          _chatCubit.clearReplyTarget();
        }
      },
      localOnly: localLane,
      localBlocked:
          localLane && (!local.ready || local.phase != LocalChatPhase.idle),
      localGenerating: local.phase == LocalChatPhase.generating,
      localModelLabel: _localModelLabel(local.selectedModelId),
      onOpenLocalModels: _showLiveSettings,
      onStopLocal: _localCubit.stop,
      voiceCapture: localLane ? null : _voiceCapture,
      onAttachVoice: () => _finishVoiceRecording(sendNow: false),
      onSendVoice: () => _finishVoiceRecording(sendNow: true),
      repository: _repository,
      chatState: chatState,
      chatCubit: _chatCubit,
      liveState: liveState,
      liveUiState: liveUiState,
      shellState: shellState,
      navigationExpanded: chrome.navigationExpanded,
      bottomInset: 0,
      isPersonalWorkspace: isPersonalWorkspace,
      onModelSelected: _selectRemoteModel,
      onOpenCreditSourceSheet: () => _showCreditSourceSheet(
        context,
        shellState: shellState,
        isPersonalWorkspace: isPersonalWorkspace,
      ),
      onThinkingModeChanged: _shellCubit.setThinkingMode,
      controller: _inputController,
      focusNode: _inputFocusNode,
      onOpenAttachments: () => _showAttachmentSheet(context, wsId),
      onCloseComposer: _dismissComposerInput,
      onToggleNavigation: _toggleComposerNavigation,
      onMicrophoneTap: () => _recordVoiceMessage(wsId),
      onSend: () => _handleSend(wsId),
      onRemoveAttachment: removeComposerAttachment,
      onRetryAttachment: retryComposerAttachment,
    );
    return AssistantComposerPanel(
      showSuggestions: showSuggestions,
      onPromptSelected: _applyStarterPrompt,
      onHeightChanged: _setComposerHeight,
      child: composer,
    );
  }

  Widget _buildLiveDock({
    required String wsId,
    required AssistantChatState chatState,
    required AssistantLiveState liveState,
    required AssistantChromeState chrome,
  }) => ShellDockPublisher(
    slot: ShellDockSlot(
      location: Routes.assistant,
      workspaceId: wsId,
      composing: !chrome.navigationExpanded,
      content: _liveCallDock(wsId, chatState, liveState),
      primary: _livePrimaryAction(),
    ),
  );
}
