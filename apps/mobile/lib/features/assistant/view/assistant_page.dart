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
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
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
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_settings_refresh.dart';
import 'package:mobile/features/assistant/data/assistant_settings_selection.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_state.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_remote_chat_actions.dart';
import 'package:mobile/features/assistant/local/assistant_remote_scope_guard.dart';
import 'package:mobile/features/assistant/models/assistant_chat_identity.dart';
import 'package:mobile/features/assistant/models/assistant_live_dispatch.dart';
import 'package:mobile/features/assistant/models/assistant_live_history_confirmation.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_start_gate.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_mobile_screen_context.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_controller.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_scope.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_session_source.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_sheet.dart';
import 'package:mobile/features/assistant/view/assistant_live_call_screen.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_capture_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_credit_source_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_header_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_history_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_haptic_feedback.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_info_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_primary_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_stage_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_local_status_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_new_chat_confirmation.dart';
import 'package:mobile/features/assistant/widgets/assistant_scroll_to_bottom_overlay.dart';
import 'package:mobile/features/assistant/widgets/assistant_starter_prompts.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_scroll_follower.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

part 'assistant_page_new_chat.dart';
part 'assistant_page_settings.dart';
part 'assistant_page_theme.dart';
part 'assistant_page_message_actions.dart';
part 'assistant_page_live_actions.dart';
part 'assistant_page_live_call.dart';
part 'assistant_page_layout.dart';
part 'assistant_page_workspace.dart';
part 'assistant_page_attachments.dart';
part 'assistant_page_chrome.dart';
part 'assistant_page_history.dart';
part 'assistant_page_local.dart';
part 'assistant_page_submission.dart';

class AssistantPage extends StatefulWidget {
  const AssistantPage({
    this.replayToken = 0,
    super.key,
    this.repository,
    this.preferences,
    this.currentActor,
    this.liveRepository,
    this.liveSocket,
  });

  final int replayToken;
  final AssistantRepository? repository;
  final AssistantPreferences? preferences;
  final String? Function()? currentActor;
  final AssistantLiveRepository? liveRepository;
  final AssistantLiveSocketClient? liveSocket;

  @override
  State<AssistantPage> createState() => _AssistantPageState();
}

class _AssistantPageState extends State<AssistantPage>
    with WidgetsBindingObserver {
  late final AssistantRepository _repository =
      widget.repository ?? AssistantRepository();
  late final AssistantPreferences _preferences =
      widget.preferences ?? AssistantPreferences();
  String? _currentActor() => (widget.currentActor ?? currentCacheUserId)();
  late final AssistantLiveRepository _liveRepository =
      widget.liveRepository ?? AssistantLiveRepository();
  final _voiceCapture = AssistantVoiceCaptureCubit();
  String? _voiceWorkspaceId;
  String? _voiceActorId;
  int? _voiceScopeVersion;
  int? _voiceLocalVersion;
  int _voiceActorScopeEpoch = 0;
  Object? _chromeActionsKey;
  List<ShellActionSpec>? _chromeActions;
  final _inputController = TextEditingController();
  late final _chatThemeActor = AssistantThemeSessionSource(
    auth: context.read<AuthCubit>(),
    actorId: _currentActor(),
  );
  late final _chatTheme = AssistantThemeController(actor: _chatThemeActor);
  double? _composerHeight;
  bool _settingsWritePending = false;
  bool _newConversationPending = false;
  bool Function()? _newConversationCurrent;
  final _inputFocusNode = FocusNode();
  final _scrollController = ScrollController();
  static const _assistantScrollPhysics = AlwaysScrollableScrollPhysics(
    parent: BouncingScrollPhysics(),
  );
  static const _composerFabThreshold = 56.0;
  late final _transcriptFollower = AssistantTranscriptScrollFollower(
    controller: _scrollController,
    onVisibilityChanged: _setScrollToBottomFabVisible,
  );

  late final AssistantShellCubit _shellCubit = AssistantShellCubit(
    repository: _repository,
    preferences: _preferences,
    currentScopeToken: () => _voiceActorScopeEpoch,
    selectSettings: _selectRemoteSettings,
    currentSettingsToken: () => (
      _localScope(),
      _chatCubit.attachmentScopeVersion,
      _chatCubit.state.storedChatId,
      _localCubit.selectionVersion,
    ),
    onSettingsSelectionFailure: _settingsSelectionFailed,
  );
  late final AssistantChatCubit _chatCubit = AssistantChatCubit(
    repository: _repository,
    preferences: _preferences,
    prepareCreationSettings: _prepareCreationSettings,
    onWorkspaceContextChanged: (workspaceContextId) =>
        _shellCubit.setWorkspaceContextId(workspaceContextId),
    prepareResetWorkspaceContext: (contextId, isCurrent) {
      final lease = _newConversationCurrent;
      bool current() => mounted && (lease?.call() ?? false) && isCurrent();
      if (!current()) return null;
      return _shellCubit.prepareResetWorkspaceContext(contextId, current);
    },
    onSoulRefreshRequested: _shellCubit.refreshSoul,
    onThemeRequested: (theme, isCurrent) async {
      if (!mounted || !isCurrent()) return;
      final mode = ThemeCubit.parseThemeMode(theme);
      await context.read<ThemeCubit>().setThemeMode(
        mode,
        isCurrent: () => mounted && isCurrent(),
      );
    },
    onSoulRefreshFailed: (_) {
      if (!mounted) return;
      final message = context.l10n.assistantSettingsRefreshFailed;
      showAppToast(context, message: message);
    },
    onImmersiveModeChanged: _shellCubit.setImmersiveMode,
    onSettingsRestored: (settings) {
      if (mounted &&
          _loadedWorkspaceId == _chatCubit.state.workspaceId &&
          _currentActor() == _repository.currentActorId) {
        _shellCubit.restoreConversationSettings(settings);
      }
    },
    onChatRestored: (modelId) async {
      if (modelId == null || assistantLiveModelMatches(modelId)) {
        return;
      }
      final current = _shellCubit.state.availableModels.where(
        (model) => model.value == modelId || model.value.endsWith('/$modelId'),
      );
      if (current.isNotEmpty) {
        _shellCubit.restoreSelectedModel(current.first);
      }
    },
  );
  late final AssistantLiveCubit _liveCubit = AssistantLiveCubit(
    currentScopeToken: () => _voiceActorScopeEpoch,
    repository: _liveRepository,
    socket: widget.liveSocket ?? AssistantLiveSocketClient(),
    audioPlayer: AssistantLiveAudioPlayer(),
    recorder: AssistantLiveRecorder(),
    cameraService: AssistantLiveCameraService(),
    onChatBound: (wsId, chatId) =>
        _chatCubit.openChatById(wsId, assistantLiveConversationId(chatId)),
    onHistoryUpdated: (wsId, chatId) async {
      await _chatCubit.openChatById(wsId, assistantLiveConversationId(chatId));
      await _chatCubit.refreshHistory();
    },
    isTurnRestored: (wsId, chatId, turnId, roles) {
      final chat = _chatCubit.state;
      return isAssistantLiveTurnHistoryConfirmed(
        loadedWorkspaceId: chat.workspaceId,
        loadedConversationId: chat.chat?.id == chat.storedChatId
            ? chat.chat?.id
            : null,
        restoreSucceeded:
            chat.status == AssistantChatStatus.idle &&
            chat.error == null &&
            chat.hasLoadedOnce,
        messages: chat.messages,
        workspaceId: wsId,
        conversationId: assistantLiveConversationId(chatId),
        turnId: turnId,
        expectedRoles: roles,
      );
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
  final _liveStartGate = AssistantLiveStartGate();
  final _liveHaptics = AssistantLiveHapticFeedback();
  bool get _liveStartPending =>
      _liveStartGate.pendingFor(_voiceActorScopeEpoch);
  bool _lifecycleDisconnectPending = false;
  bool _appIsForeground = true;

  void _resetLocalActor() {
    _syncThemeActor(force: true);
    ++_voiceActorScopeEpoch;
    _dismissLiveCall();
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
    if (state != AppLifecycleState.resumed) _liveHaptics.suspend();
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
    final epoch = _voiceActorScopeEpoch;
    final attempt = _liveStartGate.currentFor(epoch);
    try {
      await _liveCubit.disconnect();
      if (epoch == _voiceActorScopeEpoch) _liveStartGate.cancel(attempt);
    } finally {
      _lifecycleDisconnectPending = false;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncThemeActor();
    if (TickerMode.valuesOf(context).enabled) {
      _resumeLocal();
    } else if (!_isLiveCallPresented) {
      // Another route hides the page. Its own call surface keeps Live going.
      _liveHaptics.suspend();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted ||
            TickerMode.valuesOf(context).enabled ||
            _isLiveCallPresented) {
          return;
        }
        unawaited(_voiceCapture.cancel());
        unawaited(_localCubit.invalidate());
        _collapseComposerToFab();
        unawaited(_disconnectWhenHidden());
      });
    }
  }

  Future<void> _disconnectWhenHidden() async {
    await _liveBrowsingPreferenceLoad;
    if (!mounted ||
        TickerMode.valuesOf(context).enabled ||
        _isLiveCallPresented) {
      return;
    }
    if (!_keepLiveWhileBrowsing) await _disconnectForLifecycle();
  }

  @override
  void dispose() {
    _disposeChatTheme();
    WidgetsBinding.instance.removeObserver(this);
    _liveHaptics.dispose();
    _scrollController.removeListener(_handleScroll);
    _inputFocusNode.removeListener(_handleInputFocusChange);
    _inputController.dispose();
    _inputFocusNode.dispose();
    _transcriptFollower.dispose();
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
    child: _themedPage(context),
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
    _transcriptFollower.resume();
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
              _transcriptFollower.followUpdate();
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
    _transcriptFollower.observeScroll();
    if (!mounted ||
        _ignoreScrollVisibilityUpdates ||
        !_scrollController.hasClients) {
      return;
    }

    final position = _scrollController.position;
    if (!position.hasContentDimensions) {
      return;
    }

    final editing =
        MediaQuery.viewInsetsOf(context).bottom > 0 || _inputFocusNode.hasFocus;
    if (editing) {
      _setComposerVisible(true);
      _resetComposerVisibilityAnchor();
    }

    if (position.outOfRange) {
      return;
    }

    final anchorOffset = _composerVisibilityAnchorOffset ?? position.pixels;
    _composerVisibilityAnchorOffset = anchorOffset;
    final distanceFromAnchor = (position.pixels - anchorOffset).abs();
    if (_isComposerVisible &&
        !editing &&
        position.userScrollDirection != ScrollDirection.idle &&
        distanceFromAnchor >= _composerFabThreshold) {
      _setComposerVisible(false);
      _composerVisibilityAnchorOffset = position.pixels;
    }
    // The follower owns "jump to latest" visibility from user intent.
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

  void _showInlineNotice(String message) {
    showAppToast(
      context,
      message: message,
      bottomClearance: _composerReservedSpace(
        context,
        isComposerVisible: _isComposerVisible,
      ),
    );
  }

  double _composerReservedSpace(
    BuildContext context, {
    required bool isComposerVisible,
  }) {
    return assistantTranscriptBottomClearance(
      context,
      composerVisible: isComposerVisible,
      composerHeight: _composerHeight,
    );
  }

  void _setComposerHeight(double height) {
    if (mounted && _composerHeight != height) {
      setState(() => _composerHeight = height);
    }
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
}

extension on AssistantLiveConnectionStatus {
  bool get isDisconnectedOrErrored =>
      this == AssistantLiveConnectionStatus.disconnected ||
      this == AssistantLiveConnectionStatus.error;
}
