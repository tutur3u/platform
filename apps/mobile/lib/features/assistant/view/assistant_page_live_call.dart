part of 'assistant_page.dart';

/// Page states whose full-screen Live call is currently presented.
final _presentedLiveCalls = Expando<bool>('assistant-live-call-presented');

/// The presented call route's context, so the page can dismiss it.
final _liveCallRoutes = Expando<BuildContext>('assistant-live-call-route');

extension _AssistantPageLiveCall on _AssistantPageState {
  bool get _isLiveCallPresented => _presentedLiveCalls[this] ?? false;

  /// Presents the call above the shell once per page. Minimize or system Back
  /// returns to the in-shell Live view while the call continues. A new call
  /// passes its [startAttempt]; the surface closes if it settles unstarted.
  Future<void> _presentLiveCall(
    String wsId, {
    Future<void>? startAttempt,
  }) async {
    if (_isLiveCallPresented || !mounted) return;
    _presentedLiveCalls[this] = true;
    try {
      await AssistantLiveCallScreen.show(
        context,
        cubit: _liveCubit,
        assistantName: _shellCubit.state.soul.name,
        actions: (route) => _liveCallActions(wsId, route),
        startAttempt: startAttempt,
      );
    } finally {
      _presentedLiveCalls[this] = false;
      _liveCallRoutes[this] = null;
    }
  }

  /// Closes the call surface when its workspace or actor scope is gone: its
  /// actions are bound to that workspace, so Call again must not reuse them.
  /// Workspace sync runs during build, so the pop waits for the frame.
  void _dismissLiveCall() {
    final route = _liveCallRoutes[this];
    if (route == null) return;
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => dismissAssistantLiveCallRoute(route),
    );
  }

  AssistantLiveCallActions _liveCallActions(String wsId, BuildContext route) {
    _liveCallRoutes[this] = route;
    Future<void> close() async => dismissAssistantLiveCallRoute(route);

    return AssistantLiveCallActions(
      toggleMicrophone: () =>
          _handleLiveMicrophoneToggle(wsId, _chatCubit.state),
      toggleCamera: _liveCubit.toggleCamera,
      openKeyboard: () async {
        await close();
        await _openChatComposerFromLiveMode();
      },
      end: () async {
        if (_liveCubit.state.isBusy) {
          // Cancelling a connecting call leaves nothing to summarise.
          await _cancelLiveDockCall(wsId);
          await close();
        } else {
          await _liveCubit.disconnect(clearSession: true, finishTurn: true);
        }
      },
      callAgain: () => _handleLiveMicrophoneToggle(wsId, _chatCubit.state),
      minimize: close,
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
      onDisconnect: () =>
          _liveCubit.disconnect(clearSession: true, finishTurn: true),
      onOpenTextEntry: _openChatComposerFromLiveMode,
      onReturnToCall: () => _presentLiveCall(wsId),
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
      onDisconnect: () =>
          _liveCubit.disconnect(clearSession: true, finishTurn: true),
      onCameraToggle: _liveCubit.toggleCamera,
    );
  }
}
