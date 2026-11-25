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
    required bool showControls,
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
      onHeightChanged: _setComposerHeight,
      controls: showControls
          ? AssistantComposerControls(
              shellState: shellState,
              localModelLabel: localLane
                  ? _localModelLabel(local.selectedModelId) ??
                        context.l10n.assistantLocalModeAction
                  : null,
              onOpenModels: localLane
                  ? _showLiveSettings
                  : shellState.availableModels.isEmpty
                  ? null
                  : () => showAssistantModelPicker(
                      context,
                      shellState: shellState,
                      repository: _repository,
                      onModelSelected: _selectRemoteModel,
                    ),
              onThinkingModeChanged:
                  localLane ||
                      assistantModelUsesProviderDefaults(
                        shellState.selectedModel,
                      )
                  ? null
                  : _selectThinkingMode,
            )
          : null,
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

  /// Page background behind the composer down to the bottom edge, fading in
  /// just above it, so content scrolling under the composer never shows
  /// through the gap above the dock.
  Widget _composerScrim(BuildContext context) {
    final background = AppTokens.of(context).colorScheme.background;
    const fade = AppSpacing.lg;
    final height = _composerReservedSpace(context) - AppSpacing.md + fade;
    return Positioned(
      key: const ValueKey('assistant-composer-scrim'),
      left: 0,
      right: 0,
      bottom: 0,
      height: height,
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [background.withValues(alpha: 0), background],
              stops: [0, fade / height],
            ),
          ),
        ),
      ),
    );
  }

  /// Switches the response mode for later sends. A reply in flight stops,
  /// as on web, so the next send uses the new mode; the switch never waits
  /// for that reply to wind down.
  Future<void> _selectThinkingMode(AssistantThinkingMode mode) async {
    if (mode == _shellCubit.state.thinkingMode) return;
    final stopping = _chatCubit.state.isBusy
        ? _chatCubit.stopStreaming()
        : null;
    await _shellCubit.setThinkingMode(mode);
    await stopping;
  }
}
