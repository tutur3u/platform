part of 'assistant_page.dart';

extension _AssistantPageLayout on _AssistantPageState {
  Widget _buildPage(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider.value(value: _shellCubit),
        BlocProvider.value(value: _chatCubit),
        BlocProvider.value(value: _localCubit),
        BlocProvider.value(value: _liveCubit),
      ],
      child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
        builder: (context, workspaceState) {
          final currentWorkspace =
              workspaceState.currentWorkspace ??
              workspaceState.personalWorkspaceOrCurrent;
          if (currentWorkspace == null) {
            if (workspaceState.status == WorkspaceStatus.initial ||
                workspaceState.status == WorkspaceStatus.loading) {
              return const shad.Scaffold(
                child: Center(child: NovaLoadingIndicator()),
              );
            }
            return shad.Scaffold(
              child: Center(child: Text(context.l10n.assistantSelectWorkspace)),
            );
          }

          _syncWorkspace(currentWorkspace);

          return MultiBlocListener(
            listeners: [
              BlocListener<AuthCubit, AuthState>(
                listenWhen: (previous, current) =>
                    previous.user?.id != current.user?.id ||
                    previous.status != current.status,
                listener: (_, _) {
                  _resetLocalActor();
                  unawaited(_voiceCapture.cancel());
                },
              ),
              BlocListener<
                AssistantVoiceCaptureCubit,
                AssistantVoiceCaptureState
              >(
                bloc: _voiceCapture,
                listenWhen: (previous, current) =>
                    current.error != null && previous.error != current.error,
                listener: (_, state) => _showInlineNotice(
                  state.error == AssistantVoiceCaptureError.permission
                      ? context.l10n.voicePermission
                      : context.l10n.voiceRecordingError,
                ),
              ),
              BlocListener<AssistantChromeCubit, AssistantChromeState>(
                listenWhen: (previous, current) =>
                    !previous.isLiveMode && current.isLiveMode,
                listener: (_, _) => unawaited(_voiceCapture.cancel()),
              ),
              BlocListener<AssistantChromeCubit, AssistantChromeState>(
                listenWhen: (previous, current) =>
                    previous.composerVisible && !current.composerVisible,
                listener: (_, _) => _collapseComposerToFab(),
              ),
              BlocListener<AssistantLocalChatCubit, AssistantLocalChatState>(
                listenWhen: (previous, current) =>
                    previous.chat.messages != current.chat.messages,
                listener: (_, _) => _scheduleScrollToBottom(),
              ),
              BlocListener<AssistantChatCubit, AssistantChatState>(
                listenWhen: (previous, current) =>
                    previous.messages.length != current.messages.length ||
                    previous.history.length != current.history.length,
                listener: (context, state) {
                  if (!_hasTranscript(state, _liveCubit.state)) {
                    _scheduleScrollToTop();
                    return;
                  }
                  _scheduleScrollToBottom();
                },
              ),
              BlocListener<AssistantChatCubit, AssistantChatState>(
                listenWhen: (previous, current) =>
                    _activeConversationKey(previous) !=
                    _activeConversationKey(current),
                listener: (context, state) {
                  _collapseComposerToFab();
                },
              ),
              BlocListener<AssistantLiveCubit, AssistantLiveState>(
                listenWhen: (previous, current) =>
                    previous.hasDraft != current.hasDraft ||
                    previous.status != current.status,
                listener: (context, state) {
                  if (!_hasTranscript(_chatCubit.state, state)) {
                    _scheduleScrollToTop();
                    return;
                  }
                  _scheduleScrollToBottom();
                },
              ),
              BlocListener<AssistantChromeCubit, AssistantChromeState>(
                listenWhen: (previous, current) =>
                    previous.isFullscreen != current.isFullscreen,
                listener: (context, chromeState) {
                  if (_shellCubit.state.isImmersive !=
                      chromeState.isFullscreen) {
                    _shellCubit.setImmersiveMode(chromeState.isFullscreen);
                  }
                },
              ),
              BlocListener<AssistantShellCubit, AssistantShellState>(
                listenWhen: (previous, current) =>
                    previous.isImmersive != current.isImmersive,
                listener: (context, shellState) {
                  final chromeCubit = context.read<AssistantChromeCubit>();
                  if (chromeCubit.state.isFullscreen !=
                      shellState.isImmersive) {
                    chromeCubit.setFullscreen(value: shellState.isImmersive);
                  }
                },
              ),
            ],
            child: BlocBuilder<AssistantShellCubit, AssistantShellState>(
              builder: (context, shellState) {
                return BlocBuilder<AssistantChatCubit, AssistantChatState>(
                  builder: (context, remoteChatState) {
                    final local = context
                        .watch<AssistantLocalChatCubit>()
                        .state;
                    final localLane = local.local || local.blocked;
                    final chatState = localLane ? local.chat : remoteChatState;
                    return BlocBuilder<AssistantLiveCubit, AssistantLiveState>(
                      builder: (context, remoteLiveState) {
                        final liveState = localLane
                            ? const AssistantLiveState()
                            : remoteLiveState;
                        final chrome = context
                            .watch<AssistantChromeCubit>()
                            .state;
                        final isFullscreen = chrome.isFullscreen;
                        // Pending preferences block sends and retained content.
                        // Preserve the requested dock presentation.
                        final isLiveMode = chrome.isLiveMode && !local.local;
                        final liveCameraController =
                            _liveCubit.cameraController;
                        final isVisibleLiveSession = _isVisibleLiveSession(
                          chatState,
                          liveState,
                        );
                        final hasTranscript = _hasTranscript(
                          chatState,
                          liveState,
                        );
                        final keyboardVisible =
                            MediaQuery.viewInsetsOf(context).bottom > 0;
                        final hasLiveAccess =
                            !localLane && _hasLiveAccess(shellState);
                        final isPersonalWorkspace = currentWorkspace.personal;
                        const scrollDismissBehavior =
                            ScrollViewKeyboardDismissBehavior.onDrag;
                        Future<void> removeComposerAttachment(
                          String attachmentId,
                        ) {
                          return _chatCubit.removeComposerAttachment(
                            wsId: currentWorkspace.id,
                            attachmentId: attachmentId,
                          );
                        }

                        final liveUiState = deriveAssistantLiveUiState(
                          shellState: shellState,
                          liveState: liveState,
                          isEligible: hasLiveAccess,
                          isVisibleLiveSession: isVisibleLiveSession,
                          showBlockedReason: false,
                        );
                        final showLiveStrip =
                            !isLiveMode && liveUiState.showExpandedStageCard;
                        _maybeResetEmptyStateScroll(
                          workspaceId: currentWorkspace.id,
                          chatId: chatState.chat?.id ?? chatState.storedChatId,
                          hasTranscript: hasTranscript,
                          showLiveStrip: showLiveStrip || isLiveMode,
                        );
                        if (!isLiveMode) {
                          _syncComposerVisibilityForBuild(
                            keyboardVisible: keyboardVisible,
                          );
                        }

                        return shad.Scaffold(
                          resizeToAvoidBottomInset: false,
                          child: SafeArea(
                            top: false,
                            bottom: false,
                            child: ResponsiveWrapper(
                              maxWidth: ResponsivePadding.rootContentWidth(
                                context.deviceClass,
                              ),
                              child: GestureDetector(
                                behavior: HitTestBehavior.translucent,
                                onTap: _dismissKeyboard,
                                child: Stack(
                                  children: [
                                    if (isLiveMode)
                                      _buildLiveModeView(
                                        currentWorkspace.id,
                                        chatState,
                                        liveState,
                                        liveUiState,
                                        shellState,
                                        liveCameraController,
                                      )
                                    else ...[
                                      Stack(
                                        children: [
                                          CustomScrollView(
                                            controller: _scrollController,
                                            keyboardDismissBehavior:
                                                scrollDismissBehavior,
                                            physics: _AssistantPageState
                                                ._assistantScrollPhysics,
                                            slivers: [
                                              SliverPadding(
                                                padding: EdgeInsets.fromLTRB(
                                                  _horizontalPadding(context),
                                                  floatingShellHeaderInset(
                                                        context,
                                                      ) +
                                                      12,
                                                  _horizontalPadding(context),
                                                  _composerReservedSpace(
                                                    context,
                                                    isComposerVisible:
                                                        _isComposerVisible,
                                                  ),
                                                ),
                                                sliver: SliverList.list(
                                                  children: [
                                                    if (showLiveStrip) ...[
                                                      _buildLiveStageCard(
                                                        currentWorkspace.id,
                                                        chatState,
                                                        liveState,
                                                        liveCameraController,
                                                      ),
                                                      const SizedBox(
                                                        height: 12,
                                                      ),
                                                    ],
                                                    if (localLane)
                                                      _localStatus(local),
                                                    if (hasTranscript)
                                                      _buildTranscriptSection(
                                                        chatState,
                                                        liveState,
                                                        shellState,
                                                      )
                                                    else
                                                      AssistantStarterPrompts(
                                                        onPromptSelected:
                                                            _applyStarterPrompt,
                                                        replayToken:
                                                            widget.replayToken,
                                                      ),
                                                  ],
                                                ),
                                              ),
                                            ],
                                          ),
                                          if (chatState.status ==
                                              AssistantChatStatus.restoring)
                                            const Positioned(
                                              top: 0,
                                              left: 0,
                                              right: 0,
                                              child: NovaLoadingIndicator(
                                                size: 20,
                                              ),
                                            ),
                                        ],
                                      ),
                                      if (hasTranscript)
                                        AssistantScrollToBottomOverlay(
                                          composerVisible: _isComposerVisible,
                                          isFullscreen: isFullscreen,
                                          navigationExpanded:
                                              chrome.navigationExpanded,
                                          visible: _showScrollToBottomFab,
                                          onPressed:
                                              _handleScrollToBottomPressed,
                                        ),
                                    ],
                                    ShellDockPublisher(
                                      slot: ShellDockSlot(
                                        location: Routes.assistant,
                                        workspaceId: currentWorkspace.id,
                                        composing: isLiveMode
                                            ? !chrome.navigationExpanded
                                            : _isComposerVisible,
                                        content: isLiveMode
                                            ? _liveCallDock(
                                                currentWorkspace.id,
                                                chatState,
                                                liveState,
                                              )
                                            : AssistantComposerDock(
                                                embedded: true,
                                                localOnly: localLane,
                                                localBlocked:
                                                    localLane &&
                                                    (!local.ready ||
                                                        local.phase !=
                                                            LocalChatPhase
                                                                .idle),
                                                localGenerating:
                                                    local.phase ==
                                                    LocalChatPhase.generating,
                                                localModelLabel:
                                                    _localModelLabel(
                                                      local.selectedModelId,
                                                    ),
                                                onOpenLocalModels:
                                                    _showLiveSettings,
                                                onStopLocal: _localCubit.stop,
                                                voiceCapture: localLane
                                                    ? null
                                                    : _voiceCapture,
                                                onAttachVoice: () =>
                                                    _finishVoiceRecording(
                                                      sendNow: false,
                                                    ),
                                                onSendVoice: () =>
                                                    _finishVoiceRecording(
                                                      sendNow: true,
                                                    ),
                                                repository: _repository,
                                                chatState: chatState,
                                                liveState: liveState,
                                                liveUiState: liveUiState,
                                                shellState: shellState,
                                                navigationExpanded:
                                                    chrome.navigationExpanded,
                                                bottomInset: 0,
                                                isPersonalWorkspace:
                                                    isPersonalWorkspace,
                                                onModelSelected:
                                                    _selectRemoteModel,
                                                onOpenCreditSourceSheet: () =>
                                                    _showCreditSourceSheet(
                                                      context,
                                                      shellState: shellState,
                                                      isPersonalWorkspace:
                                                          isPersonalWorkspace,
                                                    ),
                                                onThinkingModeChanged:
                                                    _shellCubit.setThinkingMode,
                                                controller: _inputController,
                                                focusNode: _inputFocusNode,
                                                onOpenAttachments: () =>
                                                    _showAttachmentSheet(
                                                      context,
                                                      currentWorkspace.id,
                                                    ),
                                                onCloseComposer:
                                                    _collapseComposerToFab,
                                                onToggleNavigation:
                                                    _toggleComposerNavigation,
                                                onMicrophoneTap: () =>
                                                    _recordVoiceMessage(
                                                      currentWorkspace.id,
                                                    ),
                                                onSend: () => _handleSend(
                                                  currentWorkspace.id,
                                                  shellState,
                                                  chatState,
                                                  liveState,
                                                ),
                                                onRemoveAttachment:
                                                    removeComposerAttachment,
                                              ),
                                        primary: isLiveMode
                                            ? AssistantNavigationToggle(
                                                focusNode: _inputFocusNode,
                                                onToggle:
                                                    _toggleLiveDockNavigation,
                                              )
                                            : _isComposerVisible
                                            ? AssistantComposerPrimaryAction(
                                                controller: _inputController,
                                                focusNode: _inputFocusNode,
                                                onToggleNavigation:
                                                    _toggleComposerNavigation,
                                                onSend: () => _handleSend(
                                                  currentWorkspace.id,
                                                  shellState,
                                                  chatState,
                                                  liveState,
                                                ),
                                                voiceCapture: localLane
                                                    ? null
                                                    : _voiceCapture,
                                                onSendVoice: () =>
                                                    _finishVoiceRecording(
                                                      sendNow: true,
                                                    ),
                                                hasAttachments: chatState
                                                    .composerAttachments
                                                    .isNotEmpty,
                                                blocked:
                                                    (localLane &&
                                                        (!local.ready ||
                                                            local.phase !=
                                                                LocalChatPhase
                                                                    .idle)) ||
                                                    chatState.status ==
                                                        AssistantChatStatus
                                                            .restoring,
                                                localGenerating:
                                                    localLane &&
                                                    local.phase ==
                                                        LocalChatPhase
                                                            .generating,
                                                onStopLocal: _localCubit.stop,
                                              )
                                            : AssistantComposerFab(
                                                label: context
                                                    .l10n
                                                    .assistantAskPlaceholder,
                                                onPressed:
                                                    _restoreComposerAndFocus,
                                              ),
                                      ),
                                    ),
                                    ShellChromeActions(
                                      ownerId: 'assistant-root',
                                      locations: const {Routes.assistant},
                                      actions: _buildChromeActions(
                                        context,
                                        wsId: currentWorkspace.id,
                                        shellState: shellState,
                                        chatState: chatState,
                                        liveState: liveState,
                                        isLiveMode: isLiveMode,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    );
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }

  Widget _buildTranscriptSection(
    AssistantChatState chatState,
    AssistantLiveState liveState,
    AssistantShellState shellState,
  ) {
    return AssistantTranscriptSection(
      chatState: chatState,
      liveState: liveState,
      assistantName: shellState.soul.name,
      onRetry: () => _localCubit.state.local || _localCubit.state.blocked
          ? _localCubit.state.selectedModelId == null
                ? _showLiveSettings()
                : _localCubit.select(_localCubit.state.selectedModelId)
          : _retryRemote(shellState),
    );
  }
}
