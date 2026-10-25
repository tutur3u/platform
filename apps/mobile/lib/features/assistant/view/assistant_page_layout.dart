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
              return const AppScaffold(
                child: Center(child: NovaLoadingIndicator()),
              );
            }
            return AppScaffold(
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
                    previous.isLiveMode != current.isLiveMode,
                listener: (_, state) {
                  _liveHaptics.onLiveModeChanged(isLiveMode: state.isLiveMode);
                  if (state.isLiveMode) unawaited(_voiceCapture.cancel());
                },
              ),
              BlocListener<AssistantChromeCubit, AssistantChromeState>(
                listenWhen: (previous, current) =>
                    previous.composerVisible && !current.composerVisible,
                listener: (_, _) => _collapseComposerToFab(),
              ),
              BlocListener<AssistantLocalChatCubit, AssistantLocalChatState>(
                listenWhen: (previous, current) =>
                    previous.chat.messages != current.chat.messages,
                listener: (_, _) => _transcriptFollower.followUpdate(),
              ),
              BlocListener<AssistantChatCubit, AssistantChatState>(
                listenWhen: (previous, current) =>
                    previous.messages != current.messages ||
                    previous.history.length != current.history.length,
                listener: (context, state) {
                  if (!_hasTranscript(state, _liveCubit.state)) {
                    _scheduleScrollToTop();
                    return;
                  }
                  _transcriptFollower.followUpdate();
                },
              ),
              BlocListener<AssistantChatCubit, AssistantChatState>(
                listenWhen: (previous, current) =>
                    _activeConversationKey(previous) !=
                    _activeConversationKey(current),
                listener: (context, state) {
                  _transcriptFollower.resume();
                  _collapseComposerToFab();
                },
              ),
              BlocListener<AssistantLiveCubit, AssistantLiveState>(
                listener: (context, state) => _liveHaptics.observe(
                  state,
                  scope: (
                    _currentActor(),
                    _voiceActorScopeEpoch,
                    _shellCubit.state.workspace?.id,
                  ),
                  isActive:
                      mounted &&
                      _appIsForeground &&
                      WidgetsBinding.instance.lifecycleState ==
                          AppLifecycleState.resumed &&
                      (TickerMode.valuesOf(context).enabled ||
                          _isLiveCallPresented) &&
                      context.read<AssistantChromeCubit>().state.isLiveMode &&
                      _currentActor() != null &&
                      _shellCubit.state.workspace?.id == state.workspaceId,
                ),
              ),
              BlocListener<AssistantLiveCubit, AssistantLiveState>(
                listenWhen: (previous, current) =>
                    previous.userDraft != current.userDraft ||
                    previous.userTranscript != current.userTranscript ||
                    previous.assistantDraft != current.assistantDraft ||
                    previous.assistantTranscript !=
                        current.assistantTranscript ||
                    previous.assistantParts != current.assistantParts ||
                    previous.status != current.status,
                listener: (context, state) {
                  if (!_hasTranscript(_chatCubit.state, state)) {
                    _scheduleScrollToTop();
                    return;
                  }
                  _transcriptFollower.followUpdate();
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
                    final headerHeight = assistantHeaderContentHeight(
                      context,
                      location: Routes.assistant,
                    );
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
                        final showTranscript =
                            hasTranscript ||
                            chatState.isBusy ||
                            chatState.status == AssistantChatStatus.error;
                        final starterPrompts = AssistantStarterPrompts(
                          onPromptSelected: _applyStarterPrompt,
                          replayToken: widget.replayToken,
                        );
                        bool onTranscriptNotification(
                          Notification notification,
                        ) {
                          if (notification is ScrollNotification) {
                            return _transcriptFollower.observeNotification(
                              notification,
                            );
                          }
                          if (notification is ScrollMetricsNotification &&
                              hasTranscript) {
                            _transcriptFollower.followUpdate();
                          }
                          return false;
                        }

                        final keyboardVisible =
                            MediaQuery.viewInsetsOf(context).bottom > 0;
                        final hasLiveAccess =
                            !localLane && _hasLiveAccess(shellState);
                        final isPersonalWorkspace = currentWorkspace.personal;
                        const scrollDismissBehavior =
                            ScrollViewKeyboardDismissBehavior.onDrag;
                        final messageActionsCurrent = _messageActionScope(
                          chatState,
                        );
                        Future<void> removeComposerAttachment(
                          String attachmentId,
                        ) {
                          return _chatCubit.removeComposerAttachment(
                            wsId: currentWorkspace.id,
                            attachmentId: attachmentId,
                          );
                        }

                        Future<void> retryComposerAttachment(
                          String attachmentId,
                        ) async {
                          final timezone = await getCurrentTimezoneIdentifier();
                          if (!mounted) return;
                          await _chatCubit.retryComposerAttachment(
                            wsId: currentWorkspace.id,
                            attachmentId: attachmentId,
                            modelId: _shellCubit.state.selectedModel.value,
                            timezone: timezone,
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

                        return AppScaffold(
                          child: SafeArea(
                            top: false,
                            bottom: false,
                            // The thread is a full-width scrollable; its
                            // content is centred by the root page insets.
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
                                        NotificationListener<Notification>(
                                          onNotification:
                                              onTranscriptNotification,
                                          child: CustomScrollView(
                                            controller: _scrollController,
                                            keyboardDismissBehavior:
                                                scrollDismissBehavior,
                                            physics: _AssistantPageState
                                                ._assistantScrollPhysics,
                                            slivers: [
                                              _transcriptPage(
                                                headerHeight: headerHeight,
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
                                                    if (showTranscript)
                                                      _buildTranscriptSection(
                                                        chatState,
                                                        liveState,
                                                        shellState,
                                                      )
                                                    else
                                                      starterPrompts,
                                                  ],
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        if (chatState.status ==
                                            AssistantChatStatus.restoring)
                                          Positioned(
                                            top:
                                                floatingShellHeaderInset(
                                                  context,
                                                  minimumContentHeight:
                                                      headerHeight,
                                                ) +
                                                12,
                                            left: 0,
                                            right: 0,
                                            child: const NovaLoadingIndicator(
                                              size: 20,
                                            ),
                                          ),
                                      ],
                                    ),
                                    if (hasTranscript)
                                      AssistantScrollToBottomOverlay(
                                        composerVisible: _isComposerVisible,
                                        composerHeight: _composerHeight,
                                        isFullscreen: isFullscreen,
                                        navigationExpanded:
                                            chrome.navigationExpanded,
                                        visible: _showScrollToBottomFab,
                                        onPressed: _handleScrollToBottomPressed,
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
                                              onCancelReply: () {
                                                if (messageActionsCurrent()) {
                                                  _chatCubit.clearReplyTarget();
                                                }
                                              },
                                              onHeightChanged:
                                                  _setComposerHeight,
                                              localOnly: localLane,
                                              localBlocked:
                                                  localLane &&
                                                  (!local.ready ||
                                                      local.phase !=
                                                          LocalChatPhase.idle),
                                              localGenerating:
                                                  local.phase ==
                                                  LocalChatPhase.generating,
                                              localModelLabel: _localModelLabel(
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
                                              chatCubit: _chatCubit,
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
                                              ),
                                              onRemoveAttachment:
                                                  removeComposerAttachment,
                                              onRetryAttachment:
                                                  retryComposerAttachment,
                                            ),
                                      primary: isLiveMode
                                          ? _livePrimaryAction()
                                          : _isComposerVisible
                                          ? AssistantComposerPrimaryAction(
                                              key: const ValueKey(
                                                'assistant-dock-primary',
                                              ),
                                              controller: _inputController,
                                              focusNode: _inputFocusNode,
                                              onToggleNavigation:
                                                  _toggleComposerNavigation,
                                              onSend: () => _handleSend(
                                                currentWorkspace.id,
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
                                                      LocalChatPhase.generating,
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
                                  _localHeader(shellState, local),
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

  /// Root page gutters and centring for the full-width thread scrollable;
  /// the bottom reserves the composer instead of the plain dock clearance.
  Widget _transcriptPage({
    required double headerHeight,
    required Widget sliver,
  }) => SliverLayoutBuilder(
    builder: (context, constraints) => SliverPadding(
      padding:
          AppPageInsets.of(
            context,
            width: constraints.crossAxisExtent,
            kind: AppPageKind.root,
            topInset:
                floatingShellHeaderInset(
                  context,
                  minimumContentHeight: headerHeight,
                ) +
                AppSpacing.xs,
            consumeBottomClearance: false,
          ).copyWith(
            bottom: _composerReservedSpace(
              context,
              isComposerVisible: _isComposerVisible,
            ),
          ),
      sliver: sliver,
    ),
  );

  Widget _buildTranscriptSection(
    AssistantChatState chatState,
    AssistantLiveState liveState,
    AssistantShellState shellState,
  ) {
    final current = _messageActionScope(chatState);
    final remote = !_localCubit.state.local && !_localCubit.state.blocked;
    return AssistantTranscriptSection(
      chatState: chatState,
      liveState: liveState,
      assistantName: shellState.soul.name,
      actorId: _currentActor(),
      canPersistMessage: remote ? _chatCubit.canPersistMessage : null,
      needsReactionRefresh: remote ? _chatCubit.needsReactionRefresh : null,
      isActionCurrent: current,
      onJumpToReply: _transcriptFollower.suspend,
      onReply: _shouldSendThroughLive(chatState, liveState)
          ? null
          : (id) => _replyToMessage(id, current),
      onReact: (id, reaction) =>
          unawaited(_reactToMessage(id, reaction, current)),
      onRefreshReactions: (id) => unawaited(_reactToMessage(id, null, current)),
      onRetry: () => _localCubit.state.local || _localCubit.state.blocked
          ? _localCubit.state.selectedModelId == null
                ? _showLiveSettings()
                : _localCubit.select(_localCubit.state.selectedModelId)
          : _retryRemote(shellState),
    );
  }
}
