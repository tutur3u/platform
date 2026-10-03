import 'dart:async';

import 'package:camera/camera.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
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
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_config.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_chat_identity.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_mobile_screen_context.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_chat_feedback.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_credit_source_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_history_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_info_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_stage_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_settings_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_starter_prompts.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_voice_message_sheet.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'assistant_page_live_actions.dart';
part 'assistant_page_layout.dart';

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

  void _setKeepLiveWhileBrowsing(bool value) {
    if (mounted) setState(() => _keepLiveWhileBrowsing = value);
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
    if (state == AppLifecycleState.resumed) _appIsForeground = true;
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      _appIsForeground = false;
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
    if (!TickerMode.valuesOf(context).enabled) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || TickerMode.valuesOf(context).enabled) return;
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
    unawaited(_liveCubit.close());
    unawaited(_shellCubit.close());
    unawaited(_chatCubit.close());
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

  void _syncWorkspace(Workspace workspace) {
    if (workspace.id == _loadedWorkspaceId) {
      return;
    }

    _loadedWorkspaceId = workspace.id;
    _keepLiveWhileBrowsing = false;
    _liveBrowsingPreferenceLoad = _loadLiveBrowsingPreference(workspace.id);
    _lastEmptyStateResetKey = null;
    _wasAssistantEmptyLayout = false;
    _isComposerVisible = false;
    _showScrollToBottomFab = false;
    _composerVisibilityAnchorOffset = null;
    if (mounted) {
      context.read<AssistantChromeCubit>()
        ..setComposerVisible(visible: false)
        ..exitLiveMode();
      _inputController.clear();
      _dismissKeyboard();
    }
    final previousDisconnect = _workspaceDisconnect;
    _workspaceDisconnect = () async {
      await previousDisconnect;
      await _liveCubit.disconnect();
    }();
    unawaited(_shellCubit.loadWorkspace(workspace));
    _shellCubit.setImmersiveMode(false);
    unawaited(_chatCubit.loadWorkspace(workspace.id));
  }

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
    context.read<AssistantChromeCubit>().toggleComposerNavigation();
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
    if (_chatCubit.state.status == AssistantChatStatus.restoring) return;
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
      if (!mounted ||
          _liveCubit.state.status == AssistantLiveConnectionStatus.error) {
        return;
      }
      _chatCubit.takeUploadedComposerAttachments();
    } else {
      final timezone = await getCurrentTimezoneIdentifier();
      if (!mounted ||
          _chatCubit.state.status == AssistantChatStatus.restoring ||
          _chatCubit.state.workspaceId != wsId) {
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

  Future<void> _recordVoiceMessage(String wsId) async {
    final recording = await showAdaptiveSheet<AssistantVoiceMessageResult>(
      context: context,
      useRootNavigator: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (_) => const AssistantVoiceMessageSheet(),
    );
    if (!mounted || recording == null) return;
    await _chatCubit.addComposerAttachments(
      wsId: wsId,
      files: [recording.file],
      modelId: _shellCubit.state.selectedModel.value,
      timezone: await getCurrentTimezoneIdentifier(),
    );
    if (mounted && recording.sendNow) {
      await _handleSend(
        wsId,
        _shellCubit.state,
        _chatCubit.state,
        _liveCubit.state,
      );
    }
  }

  Future<void> _pickFiles(String wsId) async {
    final result = await FilePicker.pickFiles();
    if (result.isEmpty) {
      return;
    }

    await _chatCubit.addComposerAttachments(
      wsId: wsId,
      files: result,
      modelId: _shellCubit.state.selectedModel.value,
      timezone: await getCurrentTimezoneIdentifier(),
    );
  }

  Future<void> _pickGalleryMedia(String wsId) async {
    try {
      final media = await ImagePicker().pickMultipleMedia();
      if (media.isEmpty || !mounted) return;
      final files = media.map(GalleryPlatformFile.new).toList();
      if (!mounted) return;
      await _chatCubit.addComposerAttachments(
        wsId: wsId,
        files: files,
        modelId: _shellCubit.state.selectedModel.value,
        timezone: await getCurrentTimezoneIdentifier(),
      );
    } on Exception {
      if (mounted) _showInlineNotice(context.l10n.assistantGalleryPickError);
    }
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
          if (!mounted) return;
          if (this.context.read<AssistantChromeCubit>().state.isLiveMode) {
            await _exitLiveMode();
          }
          await _startNewConversation(wsId, _chatCubit.state, _liveCubit.state);
        },
        onSelectChat: (chat) async {
          await dismissAdaptiveDrawerOverlay(drawerContext);
          if (!mounted) return;
          if (_liveCubit.state.chatId != null &&
              _liveCubit.state.chatId != chat.id) {
            await _liveCubit.disconnect();
          }
          if (!mounted) return;
          if (this.context.read<AssistantChromeCubit>().state.isLiveMode) {
            await _exitLiveMode();
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
        onPickGalleryMedia: () async {
          await Navigator.of(sheetContext).maybePop();
          await _pickGalleryMedia(wsId);
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
      builder: (sheetContext) => AssistantCreditSourceSheet(
        cubit: _shellCubit,
        isPersonalWorkspace: isPersonalWorkspace,
      ),
    );
  }

  double _horizontalPadding(BuildContext context) {
    return context.isCompact ? 16 : 24;
  }

  double _composerReservedSpace(
    BuildContext context, {
    required bool isComposerVisible,
  }) {
    return (isComposerVisible
            ? assistantComposerHeight(context) + 24
            : _hiddenComposerReservedSpace) +
        MediaQuery.paddingOf(context).bottom +
        (isComposerVisible &&
                context.read<AssistantChromeCubit>().state.navigationExpanded &&
                MediaQuery.viewInsetsOf(context).bottom == 0
            ? assistantExpandedNavigationClearance
            : 0);
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
      onRetry: () => retryAssistantChat(_chatCubit, shellState),
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

  List<ShellActionSpec> _buildChromeActions(
    BuildContext context, {
    required String wsId,
    required AssistantShellState shellState,
    required AssistantChatState chatState,
    required AssistantLiveState liveState,
    required bool isLiveMode,
  }) => <ShellActionSpec>[
    if (!_isComposerVisible && !isLiveMode)
      ShellActionSpec(
        id: 'assistant-compose',
        inDock: true,
        icon: Icons.chat_bubble_outline_rounded,
        tooltip: context.l10n.assistantAskPlaceholder,
        onPressed: _restoreComposerAndFocus,
      ),
    if (!isLiveMode)
      ShellActionSpec(
        id: 'assistant-history',
        icon: Icons.history_rounded,
        callbackToken: '${identityHashCode(this)}:$wsId:${widget.replayToken}',
        tooltip: context.l10n.assistantHistoryTitle,
        onPressed: () => unawaited(_showHistorySheet(context, wsId)),
      ),
    if (isLiveMode)
      ShellActionSpec(
        id: 'assistant-live-settings',
        icon: Icons.tune_rounded,
        tooltip: context.l10n.assistantSettingsTitle,
        callbackToken: '$wsId:$_keepLiveWhileBrowsing',
        onPressed: () => unawaited(_showLiveSettings()),
      ),
    if (isLiveMode &&
        liveState.status == AssistantLiveConnectionStatus.disconnected)
      ShellActionSpec(
        id: 'assistant-live-start',
        inDock: true,
        icon: Icons.mic_rounded,
        tooltip: context.l10n.assistantLiveConnect,
        callbackToken: '$wsId:${liveState.status}',
        onPressed: () =>
            unawaited(_handleLiveMicrophoneToggle(wsId, chatState)),
      ),
    ShellActionSpec(
      id: 'assistant-mode-chat',
      segmentGroup: 'assistant-modes',
      icon: Icons.chat_bubble_outline_rounded,
      tooltip: context.l10n.chatTitle,
      highlighted: !isLiveMode,
      onPressed: isLiveMode ? () => unawaited(_exitLiveMode()) : null,
    ),
    ShellActionSpec(
      id: 'assistant-mode-live',
      segmentGroup: 'assistant-modes',
      icon: Icons.graphic_eq_rounded,
      tooltip: context.l10n.commonLive,
      highlighted: isLiveMode,
      onPressed: isLiveMode
          ? null
          : () => unawaited(_handleMicrophoneTap(wsId)),
    ),
  ];

  bool _hasLiveAccess(AssistantShellState shellState) {
    return hasAssistantLiveWorkspaceAccess(
      shellState.workspaceCredits,
      workspaceTier: shellState.workspace?.tier,
    );
  }

  bool _isCurrentChatLive(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) {
    final activeChatId = chatState.chat?.id ?? chatState.storedChatId;
    return isSameAssistantLiveChat(activeChatId, liveState.chatId);
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
    if (liveState.chatId == null) return false;
    if (activeChatId == null) return true;
    return isSameAssistantLiveChat(activeChatId, liveState.chatId) ||
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
