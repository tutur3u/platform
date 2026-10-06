import 'dart:async';
import 'package:camera/camera.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/gallery_platform_file.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_config.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_state.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_remote_chat_actions.dart';
import 'package:mobile/features/assistant/local/assistant_remote_scope_guard.dart';
import 'package:mobile/features/assistant/models/assistant_chat_identity.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_mobile_screen_context.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/view/assistant_settings_hub.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_capture_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_credit_source_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_history_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_info_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_stage_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_scroll_to_bottom_overlay.dart';
import 'package:mobile/features/assistant/widgets/assistant_starter_prompts.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'assistant_page_live_actions.dart';
part 'assistant_page_layout.dart';
part 'assistant_page_workspace.dart';
part 'assistant_page_attachments.dart';
part 'assistant_page_chrome.dart';
part 'assistant_page_history.dart';
part 'assistant_page_local.dart';

class AssistantPage extends StatefulWidget {
  const AssistantPage({this.replayToken = 0, super.key});

  final int replayToken;

  @override
  State<AssistantPage> createState() => _AssistantPageState();
}

class _AssistantPageState extends State<AssistantPage>
    with WidgetsBindingObserver {
  final _repository = AssistantRepository();
  final _preferences = AssistantPreferences();
  final _liveRepository = AssistantLiveRepository();
  final _voiceCapture = AssistantVoiceCaptureCubit();
  String? _voiceWorkspaceId;
  String? _voiceActorId;
  int? _voiceScopeVersion;
  int? _voiceLocalVersion;
  int _voiceActorScopeEpoch = 0;
  final _inputController = TextEditingController();
  final _inputFocusNode = FocusNode();
  final _scrollController = ScrollController();
  static const _assistantScrollPhysics = AlwaysScrollableScrollPhysics(
    parent: BouncingScrollPhysics(),
  );
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
    currentScopeToken: () => _voiceActorScopeEpoch,
    repository: _liveRepository,
    socket: AssistantLiveSocketClient(),
    audioPlayer: AssistantLiveAudioPlayer(),
    recorder: AssistantLiveRecorder(),
    cameraService: AssistantLiveCameraService(),
    onChatBound: (wsId, chatId) =>
        _chatCubit.openChatById(wsId, assistantLiveConversationId(chatId)),
    onHistoryUpdated: (wsId, chatId) async {
      await _chatCubit.openChatById(wsId, assistantLiveConversationId(chatId));
      await _chatCubit.refreshHistory();
    },
    screenContextProvider: () {
      if (!_keepLiveWhileBrowsing || !mounted) {
        return {'screen': 'unavailable'};
      }
      final uri = GoRouter.maybeOf(
        context,
      )?.routerDelegate.currentConfiguration.uri;
      return assistantMobileScreenContext(uri);
    },
  );

  late final _localCubit = AssistantLocalChatCubit(currentScope: _localScope);

  String? _loadedWorkspaceId;
  String? _lastEmptyStateResetKey;
  bool _wasAssistantEmptyLayout = false;
  bool _isComposerVisible = false;
  bool _showScrollToBottomFab = false;
  bool _keepLiveWhileBrowsing = false;
  Future<void> _workspaceDisconnect = Future<void>.value();
  Future<void> _liveBrowsingPreferenceLoad = Future<void>.value();
  bool _liveStartPending = false;
  bool _lifecycleDisconnectPending = false;
  bool _appIsForeground = true;

  void _resetLocalActor() {
    ++_voiceActorScopeEpoch;
    unawaited(_localCubit.invalidate());
    setState(() => _loadedWorkspaceId = null);
  }

  bool _ignoreScrollVisibilityUpdates = false;
  double? _composerVisibilityAnchorOffset;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _scrollController.addListener(_handleScroll);
    _inputFocusNode.addListener(_handleInputFocusChange);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _appIsForeground = true;
      _resumeLocal();
    }
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      _appIsForeground = false;
      unawaited(_localCubit.invalidate());
      unawaited(_disconnectForLifecycle());
    }
  }

  Future<void> _disconnectForLifecycle() async {
    if (_lifecycleDisconnectPending ||
        (!_liveStartPending &&
            _liveCubit.state.status ==
                AssistantLiveConnectionStatus.disconnected)) {
      return;
    }
    _lifecycleDisconnectPending = true;
    try {
      await _liveCubit.disconnect();
    } finally {
      _lifecycleDisconnectPending = false;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (TickerMode.valuesOf(context).enabled) {
      _resumeLocal();
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || TickerMode.valuesOf(context).enabled) return;
        unawaited(_voiceCapture.cancel());
        unawaited(_localCubit.invalidate());
        _collapseComposerToFab();
        unawaited(_disconnectWhenHidden());
      });
    }
  }

  Future<void> _disconnectWhenHidden() async {
    await _liveBrowsingPreferenceLoad;
    if (!mounted || TickerMode.valuesOf(context).enabled) return;
    if (!_keepLiveWhileBrowsing) await _disconnectForLifecycle();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scrollController.removeListener(_handleScroll);
    _inputFocusNode.removeListener(_handleInputFocusChange);
    _inputController.dispose();
    _inputFocusNode.dispose();
    _scrollController.dispose();
    unawaited(_voiceCapture.close());
    unawaited(_liveCubit.close());
    unawaited(_shellCubit.close());
    unawaited(_chatCubit.close());
    unawaited(_localCubit.close().catchError((Object _) {}));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => BackButtonListener(
    onBackButtonPressed: () async {
      if (!TickerMode.valuesOf(context).enabled || !_isComposerVisible) {
        return false;
      }
      final chrome = context.read<AssistantChromeCubit>();
      if (chrome.state.navigationExpanded) {
        chrome.toggleComposerNavigation();
      } else {
        _collapseComposerToFab();
      }
      return true;
    },
    child: _buildPage(context),
  );

  Future<void> _loadLiveBrowsingPreference(String wsId) async {
    bool value;
    try {
      value = await _preferences.loadKeepLiveWhileBrowsing(wsId);
    } on Exception {
      value = false;
    }
    if (!mounted || _loadedWorkspaceId != wsId) return;
    setState(() => _keepLiveWhileBrowsing = value);
    if (!value && !context.read<AssistantChromeCubit>().state.isLiveMode) {
      await _disconnectForLifecycle();
    }
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

  void _toggleComposerNavigation() {
    _dismissKeyboard();
    _collapseComposerToFab();
  }

  void _dismissKeyboard() {
    FocusManager.instance.primaryFocus?.unfocus();
  }

  void _handleInputFocusChange() {
    if (_inputFocusNode.hasFocus) {
      final chrome = context.read<AssistantChromeCubit>();
      if (chrome.state.navigationExpanded) chrome.toggleComposerNavigation();
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
    if (_isComposerVisible &&
        position.userScrollDirection != ScrollDirection.idle &&
        distanceFromAnchor >= _composerFabThreshold) {
      _setComposerVisible(false);
      _composerVisibilityAnchorOffset = position.pixels;
    }
    _setScrollToBottomFabVisible(
      (position.maxScrollExtent - position.pixels) >=
          _scrollToBottomFabThreshold,
    );
  }

  void _syncComposerVisibilityForBuild({required bool keyboardVisible}) {
    if (!keyboardVisible ||
        !_inputFocusNode.hasFocus ||
        !TickerMode.valuesOf(context).enabled ||
        _isComposerVisible) {
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

    if (!value) _dismissKeyboard();
    context.read<AssistantChromeCubit>().setComposerVisible(visible: value);
    setState(() => _isComposerVisible = value);
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
    unawaited(_voiceCapture.cancel());
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
    if (_localCubit.state.local || _localCubit.state.blocked) {
      await _localCubit.clearConversation();
      if (mounted) _scheduleScrollToTop();
      return;
    }

    final scope = _localScope();
    final version = _localCubit.scopeVersion;
    if (_isVisibleLiveSession(chatState, liveState)) {
      await _liveCubit.disconnect(clearSession: true);
    }
    if (!mounted ||
        scope != _localScope() ||
        version != _localCubit.scopeVersion) {
      return;
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
    if (_localCubit.state.local || _localCubit.state.blocked) {
      await _sendLocal();
      return;
    }
    final guard = _remoteGuard(wsId);
    if (!guard.current) return;
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
      )) {
        return;
      }
    }

    if (!guard.current || !mounted) {
      return;
    }

    _inputController.clear();
    _scheduleScrollToBottom();
  }

  void _showInlineNotice(String message) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.hideCurrentSnackBar();
    messenger?.showSnackBar(SnackBar(content: Text(message)));
  }

  double _horizontalPadding(BuildContext context) =>
      context.isCompact ? 16 : 24;

  double _composerReservedSpace(
    BuildContext context, {
    required bool isComposerVisible,
  }) {
    return assistantTranscriptBottomClearance(
      context,
      composerVisible: isComposerVisible,
    );
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
      onRetry: () => _handleLiveRetry(wsId, chatState),
      onToggleMicrophone: () => _handleLiveMicrophoneToggle(wsId, chatState),
      onToggleCamera: _liveCubit.toggleCamera,
      onDisconnect: () async {
        await _liveCubit.disconnect(clearSession: true);
        if (mounted) context.read<AssistantChromeCubit>().exitLiveMode();
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
}

extension on AssistantLiveConnectionStatus {
  bool get isDisconnectedOrErrored =>
      this == AssistantLiveConnectionStatus.disconnected ||
      this == AssistantLiveConnectionStatus.error;
}
