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
import 'package:mobile/features/assistant/widgets/assistant_history_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_info_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_stage_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_settings_sheet_body.dart';
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
      if (modelId == null) {
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

  @override
  void dispose() {
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
          final currentWorkspace = workspaceState.personalWorkspaceOrCurrent;
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
                        final hasLiveAccess = _hasLiveAccess(shellState);
                        final liveUiState = deriveAssistantLiveUiState(
                          shellState: shellState,
                          liveState: liveState,
                          isEligible: hasLiveAccess,
                          isVisibleLiveSession: isVisibleLiveSession,
                          showBlockedReason: false,
                        );
                        final showLiveStrip = liveUiState.showExpandedStageCard;
                        _maybeResetEmptyStateScroll(
                          workspaceId: currentWorkspace.id,
                          chatId: chatState.chat?.id ?? chatState.storedChatId,
                          hasTranscript: hasTranscript,
                          showLiveStrip: showLiveStrip,
                        );

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
                                    Stack(
                                      children: [
                                        CustomScrollView(
                                          controller: _scrollController,
                                          keyboardDismissBehavior:
                                              ScrollViewKeyboardDismissBehavior
                                                  .onDrag,
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
                                                    const SizedBox(height: 12),
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
                                                  child: NovaLoadingIndicator(),
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
                                      child: StaggeredEntrance(
                                        replayKey:
                                            'assistant-composer-'
                                            '${currentWorkspace.id}-'
                                            '${widget.replayToken}',
                                        delay: const Duration(
                                          milliseconds: 220,
                                        ),
                                        offset: const Offset(0, 0.12),
                                        child: AnimatedPadding(
                                          duration: const Duration(
                                            milliseconds: 180,
                                          ),
                                          curve: Curves.easeOutCubic,
                                          padding: EdgeInsets.only(
                                            bottom: isFullscreen
                                                ? MediaQuery.paddingOf(
                                                    context,
                                                  ).bottom
                                                : 0,
                                          ),
                                          child: AssistantComposerDock(
                                            chatState: chatState,
                                            liveState: liveState,
                                            liveUiState: liveUiState,
                                            creditSource:
                                                shellState.creditSource,
                                            isPersonalWorkspace:
                                                currentWorkspace.personal,
                                            workspaceCreditLocked: shellState
                                                .workspaceCreditLocked,
                                            thinkingMode:
                                                shellState.thinkingMode,
                                            onCreditSourceChanged:
                                                _shellCubit.setCreditSource,
                                            onThinkingModeChanged:
                                                _shellCubit.setThinkingMode,
                                            controller: _inputController,
                                            focusNode: _inputFocusNode,
                                            onOpenAttachments: () =>
                                                _showAttachmentSheet(
                                                  context,
                                                  currentWorkspace.id,
                                                ),
                                            onOpenSettings: () =>
                                                _showSettingsSheet(context),
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
                                                (attachmentId) => _chatCubit
                                                    .removeComposerAttachment(
                                                      wsId: currentWorkspace.id,
                                                      attachmentId:
                                                          attachmentId,
                                                    ),
                                          ),
                                        ),
                                      ),
                                    ),
                                    ShellChromeActions(
                                      ownerId: 'assistant-root',
                                      locations: const {Routes.assistant},
                                      actions: [
                                        ShellActionSpec(
                                          id: 'assistant-history',
                                          icon: Icons.history_rounded,
                                          callbackToken:
                                              '${identityHashCode(this)}:'
                                              '${currentWorkspace.id}:'
                                              '${widget.replayToken}',
                                          tooltip: context
                                              .l10n
                                              .assistantHistoryTitle,
                                          onPressed: () {
                                            unawaited(
                                              _showHistorySheet(
                                                context,
                                                currentWorkspace.id,
                                              ),
                                            );
                                          },
                                        ),
                                      ],
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
      unawaited(
        _scrollController.animateTo(
          position,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
        ),
      );
    });
  }

  void _scheduleScrollToTop() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) {
        return;
      }
      if (_scrollController.offset <= 1) {
        return;
      }
      _scrollController.jumpTo(0);
    });
  }

  void _dismissKeyboard() {
    FocusManager.instance.primaryFocus?.unfocus();
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

  Future<void> _showSettingsSheet(
    BuildContext context,
  ) async {
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) =>
          BlocBuilder<AssistantShellCubit, AssistantShellState>(
            bloc: _shellCubit,
            builder: (context, shellState) => AssistantSettingsSheetBody(
              shellState: shellState,
              onImmersiveChanged: ({required value}) =>
                  _toggleFullscreen(value),
            ),
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

  double _horizontalPadding(BuildContext context) {
    return context.isCompact ? 16 : 24;
  }

  double _composerReservedSpace(
    BuildContext context, {
    required bool isFullscreen,
    required bool hasAttachments,
  }) {
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
    _inputController
      ..text = prompt
      ..selection = TextSelection.collapsed(offset: prompt.length);
    _inputFocusNode.requestFocus();
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

  Widget _buildLiveStageCard(
    String wsId,
    AssistantChatState chatState,
    AssistantLiveState liveState,
    CameraController? liveCameraController,
  ) {
    return AssistantLiveStageCard(
      liveState: liveState,
      cameraController: liveCameraController,
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

    final activeChatId = chatState.chat?.id ?? chatState.storedChatId;
    final isVisibleLiveSession = _isVisibleLiveSession(chatState, liveState);

    if (!isVisibleLiveSession || liveState.status.isDisconnectedOrErrored) {
      await _liveCubit.prepareSession(wsId: wsId, chatId: activeChatId);
    }

    if (!mounted) {
      return;
    }

    await _liveCubit.toggleMicrophone();
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

extension on AssistantLiveConnectionStatus {
  bool get isDisconnectedOrErrored =>
      this == AssistantLiveConnectionStatus.disconnected ||
      this == AssistantLiveConnectionStatus.error;
}
