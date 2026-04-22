import 'dart:async';

import 'package:camera/camera.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_config.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_credit_source_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_history_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_info_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_stage_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_starter_prompts.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/staggered_entrance.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AssistantPage extends StatefulWidget {
  const AssistantPage({
    this.replayToken = 0,
    super.key,
  });

  final int replayToken;

  @override
  State<AssistantPage> createState() => _AssistantPageState();
}

class _AssistantPageState extends State<AssistantPage> {
  final _repository = AssistantRepository();
  final _preferences = AssistantPreferences();
  final _liveRepository = AssistantLiveRepository();
  final _inputController = TextEditingController();
  final _inputFocusNode = FocusNode();
  final _scrollController = ScrollController();

  static const _assistantScrollPhysics = AlwaysScrollableScrollPhysics(
    parent: BouncingScrollPhysics(),
  );
  static const _hiddenComposerReservedSpace = 88.0;
  static const _assistantFabBottomOffset = 16.0;
  static const _assistantFabSideOffset = 16.0;
  static const _composerFabThreshold = 56.0;
  static const _scrollToBottomFabThreshold = 160.0;

  late final AssistantShellCubit _shellCubit = AssistantShellCubit(
    repository: _repository,
    preferences: _preferences,
  );
  late final AssistantChatCubit _chatCubit = AssistantChatCubit(
    repository: _repository,
    preferences: _preferences,
    onWorkspaceContextChanged: (workspaceContextId) =>
        _shellCubit.setWorkspaceContextId(workspaceContextId),
    onSoulRefreshRequested: _shellCubit.refreshSoul,
    onImmersiveModeChanged: _shellCubit.setImmersiveMode,
    onChatRestored: (modelId) async {
      if (modelId == null || assistantLiveModelMatches(modelId)) {
        return;
      }
      final current = _shellCubit.state.availableModels.where(
        (model) => model.value == modelId || model.value.endsWith('/$modelId'),
      );
      if (current.isNotEmpty) {
        await _shellCubit.setSelectedModel(current.first);
      }
    },
  );
  late final AssistantLiveCubit _liveCubit = AssistantLiveCubit(
    repository: _liveRepository,
    socket: AssistantLiveSocketClient(),
    audioPlayer: AssistantLiveAudioPlayer(),
    recorder: AssistantLiveRecorder(),
    cameraService: AssistantLiveCameraService(),
    onChatBound: (wsId, chatId) => _chatCubit.openChatById(wsId, chatId),
    onHistoryUpdated: (wsId, chatId) async {
      await _chatCubit.openChatById(wsId, chatId);
      await _chatCubit.refreshHistory();
    },
  );

  String? _loadedWorkspaceId;
  String? _lastEmptyStateResetKey;
  bool _wasAssistantEmptyLayout = false;
  bool _isComposerVisible = false;
  bool _showScrollToBottomFab = false;
  bool _ignoreScrollVisibilityUpdates = false;
  double? _composerVisibilityAnchorOffset;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_handleScroll);
    _inputFocusNode.addListener(_handleInputFocusChange);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_handleScroll);
    _inputFocusNode.removeListener(_handleInputFocusChange);
    _inputController.dispose();
    _inputFocusNode.dispose();
    _scrollController.dispose();
    unawaited(_liveCubit.close());
    unawaited(_shellCubit.close());
    unawaited(_chatCubit.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider.value(value: _shellCubit),
        BlocProvider.value(value: _chatCubit),
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
                  builder: (context, chatState) {
                    return BlocBuilder<AssistantLiveCubit, AssistantLiveState>(
                      builder: (context, liveState) {
                        final isFullscreen = context
                            .select<AssistantChromeCubit, bool>(
                              (cubit) => cubit.state.isFullscreen,
                            );
                        final isLiveMode = context
                            .select<AssistantChromeCubit, bool>(
                              (cubit) => cubit.state.isLiveMode,
                            );
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
                        final hasLiveAccess = _hasLiveAccess(shellState);
                        final isPersonalWorkspace = currentWorkspace.personal;
                        const scrollDismissBehavior =
                            ScrollViewKeyboardDismissBehavior.onDrag;
                        final scrollToBottomLabel =
                            context.l10n.assistantScrollToBottomAction;
                        final scrollToBottomFab = _AssistantScrollToBottomFab(
                          label: scrollToBottomLabel,
                          onPressed: _handleScrollToBottomPressed,
                        );
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
                              maxWidth: ResponsivePadding.maxContentWidth(
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
                                            physics: _assistantScrollPhysics,
                                            slivers: [
                                              SliverPadding(
                                                padding: EdgeInsets.fromLTRB(
                                                  _horizontalPadding(context),
                                                  12,
                                                  _horizontalPadding(context),
                                                  _composerReservedSpace(
                                                    context,
                                                    isFullscreen: isFullscreen,
                                                    hasAttachments: chatState
                                                        .composerAttachments
                                                        .isNotEmpty,
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
                                            Positioned.fill(
                                              child: AbsorbPointer(
                                                child: ColoredBox(
                                                  color: Theme.of(context)
                                                      .colorScheme
                                                      .surface
                                                      .withValues(alpha: 0.72),
                                                  child: const Center(
                                                    child:
                                                        NovaLoadingIndicator(),
                                                  ),
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                      Positioned(
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        child: IgnorePointer(
                                          ignoring: !_isComposerVisible,
                                          child: AnimatedSlide(
                                            duration: const Duration(
                                              milliseconds: 180,
                                            ),
                                            curve: Curves.easeOutCubic,
                                            offset: _isComposerVisible
                                                ? Offset.zero
                                                : const Offset(0, 1),
                                            child: AnimatedOpacity(
                                              duration: const Duration(
                                                milliseconds: 160,
                                              ),
                                              curve: Curves.easeOutCubic,
                                              opacity: _isComposerVisible
                                                  ? 1
                                                  : 0,
                                              child: StaggeredEntrance(
                                                replayKey:
                                                    'assistant-composer-'
                                                    '${currentWorkspace.id}-'
                                                    '${widget.replayToken}',
                                                delay: const Duration(
                                                  milliseconds: 220,
                                                ),
                                                offset: const Offset(0, 0.12),
                                                child: AssistantComposerDock(
                                                  chatState: chatState,
                                                  liveState: liveState,
                                                  liveUiState: liveUiState,
                                                  creditSource:
                                                      shellState.creditSource,
                                                  isFullscreen: isFullscreen,
                                                  bottomInset: isFullscreen
                                                      ? MediaQuery.paddingOf(
                                                          context,
                                                        ).bottom
                                                      : 0,
                                                  isPersonalWorkspace:
                                                      isPersonalWorkspace,
                                                  thinkingMode:
                                                      shellState.thinkingMode,
                                                  onOpenCreditSourceSheet: () =>
                                                      _showCreditSourceSheet(
                                                        context,
                                                        shellState: shellState,
                                                        isPersonalWorkspace:
                                                            isPersonalWorkspace,
                                                      ),
                                                  onThinkingModeChanged:
                                                      _shellCubit
                                                          .setThinkingMode,
                                                  controller: _inputController,
                                                  focusNode: _inputFocusNode,
                                                  onOpenAttachments: () =>
                                                      _showAttachmentSheet(
                                                        context,
                                                        currentWorkspace.id,
                                                      ),
                                                  onToggleFullscreen: () =>
                                                      _toggleFullscreen(
                                                        !isFullscreen,
                                                      ),
                                                  onMicrophoneTap: () =>
                                                      _handleMicrophoneTap(
                                                        currentWorkspace.id,
                                                        shellState,
                                                        chatState,
                                                        liveState,
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
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                      Positioned(
                                        right:
                                            _assistantFabSideOffset +
                                            MediaQuery.paddingOf(context).right,
                                        bottom:
                                            _assistantFabBottomOffset +
                                            (isFullscreen
                                                ? MediaQuery.paddingOf(
                                                    context,
                                                  ).bottom
                                                : 0),
                                        child: IgnorePointer(
                                          ignoring: _isComposerVisible,
                                          child: AnimatedSlide(
                                            duration: const Duration(
                                              milliseconds: 180,
                                            ),
                                            curve: Curves.easeOutCubic,
                                            offset: _isComposerVisible
                                                ? const Offset(0, 1)
                                                : Offset.zero,
                                            child: AnimatedOpacity(
                                              duration: const Duration(
                                                milliseconds: 160,
                                              ),
                                              curve: Curves.easeOutCubic,
                                              opacity: _isComposerVisible
                                                  ? 0
                                                  : 1,
                                              child: _AssistantComposerFab(
                                                label: context
                                                    .l10n
                                                    .assistantAskPlaceholder,
                                                onPressed:
                                                    _restoreComposerAndFocus,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                      if (hasTranscript)
                                        Positioned(
                                          left: 0,
                                          right: 0,
                                          bottom:
                                              (_isComposerVisible ? 112 : 16) +
                                              (isFullscreen
                                                  ? MediaQuery.paddingOf(
                                                      context,
                                                    ).bottom
                                                  : 0),
                                          child: IgnorePointer(
                                            ignoring: !_showScrollToBottomFab,
                                            child: Center(
                                              child: AnimatedSlide(
                                                duration: const Duration(
                                                  milliseconds: 180,
                                                ),
                                                curve: Curves.easeOutCubic,
                                                offset: _showScrollToBottomFab
                                                    ? Offset.zero
                                                    : const Offset(0, 1),
                                                child: AnimatedOpacity(
                                                  duration: const Duration(
                                                    milliseconds: 160,
                                                  ),
                                                  curve: Curves.easeOutCubic,
                                                  opacity:
                                                      _showScrollToBottomFab
                                                      ? 1
                                                      : 0,
                                                  child: scrollToBottomFab,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
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

  void _syncWorkspace(Workspace workspace) {
    if (workspace.id == _loadedWorkspaceId) {
      return;
    }

    _loadedWorkspaceId = workspace.id;
    _lastEmptyStateResetKey = null;
    _wasAssistantEmptyLayout = false;
    _isComposerVisible = false;
    _showScrollToBottomFab = false;
    _composerVisibilityAnchorOffset = null;
    if (mounted) {
      context.read<AssistantChromeCubit>().exitLiveMode();
    }
    unawaited(_liveCubit.disconnect());
    unawaited(_shellCubit.loadWorkspace(workspace));
    _shellCubit.setImmersiveMode(false);
    unawaited(_chatCubit.loadWorkspace(workspace.id));
  }

  void _scheduleScrollToBottom() {
    if (!_scrollController.hasClients) {
      return;
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) {
        return;
      }

      final position = _scrollController.position.maxScrollExtent;
      _ignoreScrollVisibilityUpdates = true;
      unawaited(
        _scrollController
            .animateTo(
              position,
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
            )
            .catchError((_) {})
            .whenComplete(() {
              if (!mounted) {
                return;
              }
              _ignoreScrollVisibilityUpdates = false;
              _resetComposerVisibilityAnchor();
              _setScrollToBottomFabVisible(false);
            }),
      );
    });
  }

  void _handleScrollToBottomPressed() {
    _scheduleScrollToBottom();
  }

  void _scheduleScrollToTop() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) {
        return;
      }
      if (_scrollController.offset <= 1) {
        return;
      }
      _ignoreScrollVisibilityUpdates = true;
      _scrollController.jumpTo(0);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }
        _ignoreScrollVisibilityUpdates = false;
        _resetComposerVisibilityAnchor();
        _setScrollToBottomFabVisible(false);
      });
    });
  }

  void _dismissKeyboard() {
    FocusManager.instance.primaryFocus?.unfocus();
  }

  void _handleInputFocusChange() {
    if (_inputFocusNode.hasFocus) {
      _setComposerVisible(true);
      _resetComposerVisibilityAnchor();
    }
  }

  void _handleScroll() {
    if (!mounted ||
        _ignoreScrollVisibilityUpdates ||
        !_scrollController.hasClients) {
      return;
    }

    final position = _scrollController.position;
    if (!position.hasContentDimensions) {
      return;
    }

    if (MediaQuery.viewInsetsOf(context).bottom > 0 ||
        _inputFocusNode.hasFocus) {
      _setComposerVisible(true);
      _resetComposerVisibilityAnchor();
      _setScrollToBottomFabVisible(false);
      return;
    }

    if (position.outOfRange) {
      return;
    }

    final anchorOffset = _composerVisibilityAnchorOffset ?? position.pixels;
    _composerVisibilityAnchorOffset = anchorOffset;
    final distanceFromAnchor = (position.pixels - anchorOffset).abs();
    if (_isComposerVisible && distanceFromAnchor >= _composerFabThreshold) {
      _setComposerVisible(false);
      _composerVisibilityAnchorOffset = position.pixels;
    }
    _setScrollToBottomFabVisible(
      (position.maxScrollExtent - position.pixels) >=
          _scrollToBottomFabThreshold,
    );
  }

  void _syncComposerVisibilityForBuild({
    required bool keyboardVisible,
  }) {
    if (!keyboardVisible || _isComposerVisible) {
      return;
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      _setComposerVisible(true);
      _resetComposerVisibilityAnchor();
    });
  }

  void _setComposerVisible(bool value) {
    if (_isComposerVisible == value || !mounted) {
      return;
    }

    setState(() {
      _isComposerVisible = value;
    });
  }

  void _setScrollToBottomFabVisible(bool value) {
    if (_showScrollToBottomFab == value || !mounted) {
      return;
    }

    setState(() {
      _showScrollToBottomFab = value;
    });
  }

  void _collapseComposerToFab() {
    _dismissKeyboard();
    _setComposerVisible(false);
    _composerVisibilityAnchorOffset = null;
  }

  void _restoreComposerAndFocus() {
    _setComposerVisible(true);
    _resetComposerVisibilityAnchor();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      _inputFocusNode.requestFocus();
    });
  }

  Future<void> _startNewConversation(
    String wsId,
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) async {
    _dismissKeyboard();
    _inputController.clear();

    if (_isVisibleLiveSession(chatState, liveState)) {
      await _liveCubit.disconnect(clearSession: true);
    }

    await _chatCubit.resetConversation(wsId);
    if (!mounted) {
      return;
    }
    _scheduleScrollToTop();
  }

  Future<void> _handleSend(
    String wsId,
    AssistantShellState shellState,
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) async {
    if (chatState.composerAttachments.any(
      (attachment) =>
          attachment.uploadState == AssistantAttachmentUploadState.uploading,
    )) {
      _showInlineNotice(context.l10n.assistantAttachmentUploadPending);
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
      if (!mounted ||
          _liveCubit.state.status == AssistantLiveConnectionStatus.error) {
        return;
      }
      _chatCubit.takeUploadedComposerAttachments();
    } else {
      final timezone = await getCurrentTimezoneIdentifier();
      if (!mounted) {
        return;
      }
      await _chatCubit.submit(
        wsId: wsId,
        message: text,
        modelId: shellState.selectedModel.value,
        thinkingMode: shellState.thinkingMode,
        creditSource: shellState.creditSource,
        workspaceContextId: shellState.workspaceContextId,
        timezone: timezone,
        creditWsId: _resolveCreditWorkspaceId(shellState, wsId),
      );
    }

    if (!mounted) {
      return;
    }

    _inputController.clear();
    _scheduleScrollToBottom();
  }

  Future<void> _pickFiles(String wsId) async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
    );
    if (result == null || result.files.isEmpty) {
      return;
    }

    await _chatCubit.addComposerAttachments(wsId: wsId, files: result.files);
  }

  Future<void> _toggleFullscreen(bool value) async {
    FocusManager.instance.primaryFocus?.unfocus();
    context.read<AssistantChromeCubit>().setFullscreen(value: value);
    _shellCubit.setImmersiveMode(value);
  }

  void _showInlineNotice(String message) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.hideCurrentSnackBar();
    messenger?.showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _showHistorySheet(BuildContext context, String wsId) async {
    await _chatCubit.refreshHistory();
    if (!mounted || !context.mounted) {
      return;
    }
    await showAdaptiveDrawer(
      context: context,
      builder: (drawerContext) => AssistantHistorySheetBody(
        chatCubit: _chatCubit,
        activeChatId: _chatCubit.state.chat?.id,
        onClose: () => dismissAdaptiveDrawerOverlay(drawerContext),
        onNewConversation: () async {
          await dismissAdaptiveDrawerOverlay(drawerContext);
          if (!mounted) {
            return;
          }
          await _startNewConversation(
            wsId,
            _chatCubit.state,
            _liveCubit.state,
          );
        },
        onSelectChat: (chat) async {
          await dismissAdaptiveDrawerOverlay(drawerContext);
          if (_liveCubit.state.chatId != null &&
              _liveCubit.state.chatId != chat.id) {
            await _liveCubit.disconnect();
          }
          await _chatCubit.openChat(wsId, chat);
        },
      ),
    );
  }

  Future<void> _showAttachmentSheet(BuildContext context, String wsId) async {
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantAttachmentSheetBody(
        hasAttachments: _chatCubit.state.composerAttachments.isNotEmpty,
        onPickFiles: () async {
          await Navigator.of(sheetContext).maybePop();
          await _pickFiles(wsId);
        },
        onClearAttachments: () async {
          final attachments = _chatCubit.state.composerAttachments
              .map((attachment) => attachment.id)
              .toList(growable: false);
          await Navigator.of(sheetContext).maybePop();
          for (final attachmentId in attachments) {
            await _chatCubit.removeComposerAttachment(
              wsId: wsId,
              attachmentId: attachmentId,
            );
          }
        },
      ),
    );
  }

  Future<void> _showCreditSourceSheet(
    BuildContext context, {
    required AssistantShellState shellState,
    required bool isPersonalWorkspace,
  }) async {
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantCreditSourceSheetBody(
        shellState: shellState,
        isPersonalWorkspace: isPersonalWorkspace,
        onClose: () => Navigator.of(sheetContext).maybePop(),
        onSelect: (source) async {
          if (!shellState.workspaceCreditLocked ||
              source == AssistantCreditSource.personal) {
            await _shellCubit.setCreditSource(source);
          }
          if (!sheetContext.mounted) {
            return;
          }
          await Navigator.of(sheetContext).maybePop();
        },
      ),
    );
  }

  double _horizontalPadding(BuildContext context) {
    return context.isCompact ? 16 : 24;
  }

  double _composerReservedSpace(
    BuildContext context, {
    required bool isFullscreen,
    required bool hasAttachments,
    required bool isComposerVisible,
  }) {
    if (!isComposerVisible) {
      return _hiddenComposerReservedSpace +
          (isFullscreen ? MediaQuery.paddingOf(context).bottom : 16);
    }

    final baseHeight = hasAttachments ? 236.0 : 196.0;
    return baseHeight +
        (isFullscreen ? MediaQuery.paddingOf(context).bottom : 16);
  }

  void _maybeResetEmptyStateScroll({
    required String workspaceId,
    required String? chatId,
    required bool hasTranscript,
    required bool showLiveStrip,
  }) {
    final isEmptyLayout = !hasTranscript && !showLiveStrip;
    if (!isEmptyLayout) {
      _wasAssistantEmptyLayout = false;
      _lastEmptyStateResetKey = null;
      return;
    }

    final resetKey = '$workspaceId:${chatId ?? 'new'}:${widget.replayToken}';
    final layoutBecameEmpty = !_wasAssistantEmptyLayout;
    final emptyContextChanged = _lastEmptyStateResetKey != resetKey;
    _wasAssistantEmptyLayout = true;

    if (layoutBecameEmpty || emptyContextChanged) {
      _lastEmptyStateResetKey = resetKey;
      _scheduleScrollToTop();
    }
  }

  void _applyStarterPrompt(String prompt) {
    _setComposerVisible(true);
    _resetComposerVisibilityAnchor();
    _inputController
      ..text = prompt
      ..selection = TextSelection.collapsed(offset: prompt.length);
    _inputFocusNode.requestFocus();
  }

  void _resetComposerVisibilityAnchor() {
    if (!_scrollController.hasClients) {
      _composerVisibilityAnchorOffset = null;
      return;
    }
    _composerVisibilityAnchorOffset = _scrollController.position.pixels;
  }

  String _activeConversationKey(AssistantChatState state) {
    return state.chat?.id ?? state.storedChatId ?? 'new';
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
    );
  }

  Widget _buildLiveModeView(
    String wsId,
    AssistantChatState chatState,
    AssistantLiveState liveState,
    AssistantLiveUiState liveUiState,
    AssistantShellState shellState,
    CameraController? liveCameraController,
  ) {
    return AssistantLiveModeView(
      chatState: chatState,
      liveState: liveState,
      liveUiState: liveUiState,
      assistantName: shellState.soul.name,
      cameraController: liveCameraController,
      scrollController: _scrollController,
      onClose: _exitLiveMode,
      onRetry: () => _handleLiveRetry(wsId, chatState),
      onToggleMicrophone: () => _handleLiveMicrophoneToggle(wsId, chatState),
      onToggleCamera: _liveCubit.toggleCamera,
      onDisconnect: () async {
        await _liveCubit.disconnect(clearSession: true);
        await _exitLiveMode();
      },
      onOpenTextEntry: _openChatComposerFromLiveMode,
    );
  }

  Widget _buildLiveStageCard(
    String wsId,
    AssistantChatState chatState,
    AssistantLiveState liveState,
    CameraController? liveCameraController,
  ) {
    return AssistantLiveStageCard(
      liveState: liveState,
      cameraController: liveCameraController,
      onOpenLiveMode: () => _enterLiveMode(
        wsId: wsId,
        activeChatId: chatState.chat?.id ?? chatState.storedChatId,
        autoStartMicrophone: false,
      ),
      onRetry: () => _handleLiveRetry(wsId, chatState),
      onDisconnect: () => _liveCubit.disconnect(clearSession: true),
      onCameraToggle: _liveCubit.toggleCamera,
    );
  }

  Future<void> _handleMicrophoneTap(
    String wsId,
    AssistantShellState shellState,
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) async {
    if (!_hasLiveAccess(shellState)) {
      final blockedState = deriveAssistantLiveUiState(
        shellState: shellState,
        liveState: liveState,
        isEligible: false,
        isVisibleLiveSession: _isVisibleLiveSession(chatState, liveState),
        showBlockedReason: true,
      );
      await _showLiveInfoSheet(
        context,
        liveUiState: blockedState,
        liveState: liveState,
      );
      return;
    }

    await _enterLiveMode(
      wsId: wsId,
      activeChatId: chatState.chat?.id ?? chatState.storedChatId,
      autoStartMicrophone: true,
    );
  }

  Future<void> _showLiveInfoSheet(
    BuildContext context, {
    required AssistantLiveUiState liveUiState,
    required AssistantLiveState liveState,
  }) async {
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantLiveInfoSheetBody(
        liveUiState: liveUiState,
        liveState: liveState,
        onClose: () => Navigator.of(sheetContext).maybePop(),
      ),
    );
  }

  Future<void> _handleLiveRetry(
    String wsId,
    AssistantChatState chatState,
  ) async {
    await _liveCubit.prepareSession(
      wsId: wsId,
      chatId: chatState.chat?.id ?? chatState.storedChatId,
      reconnect: _liveCubit.state.chatId != null,
    );
  }

  Future<void> _handleLiveMicrophoneToggle(
    String wsId,
    AssistantChatState chatState,
  ) async {
    if (_liveCubit.state.isMicrophoneActive) {
      await _liveCubit.toggleMicrophone();
      return;
    }
    await _enterLiveMode(
      wsId: wsId,
      activeChatId: chatState.chat?.id ?? chatState.storedChatId,
      autoStartMicrophone: true,
    );
  }

  Future<void> _enterLiveMode({
    required String wsId,
    required String? activeChatId,
    required bool autoStartMicrophone,
  }) async {
    _dismissKeyboard();
    context.read<AssistantChromeCubit>().enterLiveMode();

    final liveState = _liveCubit.state;
    final isVisibleLiveSession = _isVisibleLiveSession(
      _chatCubit.state,
      liveState,
    );
    if (!isVisibleLiveSession || liveState.status.isDisconnectedOrErrored) {
      await _liveCubit.prepareSession(
        wsId: wsId,
        chatId: activeChatId,
        model: assistantLiveModelId,
      );
    }

    if (!mounted ||
        _liveCubit.state.status == AssistantLiveConnectionStatus.error ||
        !autoStartMicrophone) {
      return;
    }

    if (!_liveCubit.state.isMicrophoneActive) {
      await _liveCubit.toggleMicrophone();
    }
  }

  Future<void> _exitLiveMode() async {
    if (_liveCubit.state.isMicrophoneActive) {
      await _liveCubit.toggleMicrophone();
    }
    if (_liveCubit.state.isCameraActive) {
      await _liveCubit.toggleCamera();
    }
    if (!mounted) {
      return;
    }
    context.read<AssistantChromeCubit>().exitLiveMode();
  }

  Future<void> _openChatComposerFromLiveMode() async {
    await _exitLiveMode();
    if (!mounted) {
      return;
    }
    _restoreComposerAndFocus();
  }

  List<ShellActionSpec> _buildChromeActions(
    BuildContext context, {
    required String wsId,
    required AssistantShellState shellState,
    required AssistantChatState chatState,
    required AssistantLiveState liveState,
    required bool isLiveMode,
  }) {
    final actions = <ShellActionSpec>[
      ShellActionSpec(
        id: 'assistant-live-mode',
        icon: isLiveMode
            ? Icons.hearing_disabled_rounded
            : Icons.graphic_eq_rounded,
        callbackToken:
            '${identityHashCode(this)}:live:$wsId:${liveState.status.name}',
        tooltip: isLiveMode
            ? context.l10n.assistantLiveReturnToChat
            : context.l10n.assistantLiveConnect,
        highlighted: isLiveMode,
        onPressed: () {
          unawaited(
            isLiveMode
                ? _exitLiveMode()
                : _handleMicrophoneTap(wsId, shellState, chatState, liveState),
          );
        },
      ),
    ];
    if (!isLiveMode) {
      actions.add(
        ShellActionSpec(
          id: 'assistant-history',
          icon: Icons.history_rounded,
          callbackToken:
              '${identityHashCode(this)}:$wsId:${widget.replayToken}',
          tooltip: context.l10n.assistantHistoryTitle,
          onPressed: () {
            unawaited(_showHistorySheet(context, wsId));
          },
        ),
      );
    }
    return actions;
  }

  bool _hasLiveAccess(AssistantShellState shellState) {
    const premiumTiers = {'PLUS', 'PRO', 'ENTERPRISE'};
    const liveFeatures = {
      'voice_assistant',
      'voice-assistant',
      'live_assistant',
      'live-assistant',
    };
    final tier = shellState.activeCredits.tier.toUpperCase();
    return premiumTiers.contains(tier) ||
        shellState.activeCredits.allowedFeatures.any(liveFeatures.contains);
  }

  bool _isCurrentChatLive(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) {
    final activeChatId = chatState.chat?.id ?? chatState.storedChatId;
    return activeChatId != null && activeChatId == liveState.chatId;
  }

  bool _isVisibleLiveSession(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) {
    final activeChatId = chatState.chat?.id ?? chatState.storedChatId;
    if (liveState.workspaceId != null &&
        chatState.workspaceId != null &&
        liveState.workspaceId != chatState.workspaceId) {
      return false;
    }
    if (liveState.chatId == null) {
      return false;
    }
    if (activeChatId == null) {
      return true;
    }
    return activeChatId == liveState.chatId ||
        liveState.status != AssistantLiveConnectionStatus.disconnected;
  }

  bool _shouldSendThroughLive(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) {
    return _isCurrentChatLive(chatState, liveState) &&
        liveState.chatId != null &&
        liveState.status != AssistantLiveConnectionStatus.disconnected;
  }

  bool _hasTranscript(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) {
    return chatState.messages.isNotEmpty || liveState.hasDraft;
  }

  String? _resolveCreditWorkspaceId(
    AssistantShellState shellState,
    String wsId,
  ) {
    return shellState.creditSource == AssistantCreditSource.personal
        ? shellState.personalWorkspaceId
        : wsId;
  }
}

class _AssistantComposerFab extends StatelessWidget {
  const _AssistantComposerFab({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      button: true,
      child: SizedBox(
        width: 56,
        height: 56,
        child: shad.PrimaryButton(
          onPressed: onPressed,
          shape: shad.ButtonShape.circle,
          density: shad.ButtonDensity.icon,
          child: const Icon(Icons.chat_bubble_outline_rounded, size: 24),
        ),
      ),
    );
  }
}

class _AssistantScrollToBottomFab extends StatelessWidget {
  const _AssistantScrollToBottomFab({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      button: true,
      child: SizedBox(
        width: 48,
        height: 48,
        child: shad.PrimaryButton(
          onPressed: onPressed,
          shape: shad.ButtonShape.circle,
          density: shad.ButtonDensity.icon,
          child: const Icon(Icons.arrow_downward_rounded, size: 22),
        ),
      ),
    );
  }
}

extension on AssistantLiveConnectionStatus {
  bool get isDisconnectedOrErrored =>
      this == AssistantLiveConnectionStatus.disconnected ||
      this == AssistantLiveConnectionStatus.error;
}
