part of 'assistant_live_cubit.dart';

extension AssistantLiveScreenControls on AssistantLiveCubit {
  Future<void> toggleScreenSharing({
    required String notificationTitle,
    required String stopLabel,
    required String stopMessage,
  }) async {
    if (state.isScreenSharing || state.isScreenSharingPending) {
      await stopScreenSharing();
      return;
    }
    if (!_screenService.isSupported || isClosed) return;
    if (_screenService.requiresMicrophone && !state.isMicrophoneActive) {
      _emitMicrophoneState(
        state.copyWith(screenSharingError: 'microphone_required'),
      );
      return;
    }
    if (state.status != AssistantLiveConnectionStatus.connected) {
      _emitMicrophoneState(
        state.copyWith(screenSharingError: 'connection_required'),
      );
      return;
    }
    final version = ++_screenVersion;
    final request = _requestVersion;
    final workspace = state.workspaceId;
    _emitMicrophoneState(
      state.copyWith(isScreenSharingPending: true, screenSharingError: null),
    );
    try {
      await _cameraService.stopStreaming();
      if (isClosed || version != _screenVersion) return;
      _emitMicrophoneState(
        state.copyWith(isCameraActive: false, latestCameraFrame: null),
      );
      _screenSubscription = _screenService.events.listen(
        (event) {
          if (isClosed ||
              version != _screenVersion ||
              state.workspaceId != workspace) {
            return;
          }
          switch (event['type']) {
            case 'started':
              _emitMicrophoneState(
                state.copyWith(
                  isScreenSharing: true,
                  isScreenSharingPending: false,
                ),
              );
            case 'paused':
              _emitMicrophoneState(
                state.copyWith(
                  isScreenSharing: false,
                  isScreenSharingPending: true,
                ),
              );
            case 'frame':
              final bytes = event['bytes'];
              if (state.isScreenSharing &&
                  state.status == AssistantLiveConnectionStatus.connected &&
                  bytes is Uint8List &&
                  bytes.isNotEmpty &&
                  bytes.length <= 512 * 1024) {
                _ensureActiveTurn();
                _socket.sendVideoFrame(bytes);
              }
            case 'stopped':
              unawaited(stopScreenSharing());
            case 'error':
              unawaited(stopScreenSharing(error: 'capture_unavailable'));
          }
        },
        onError: (_) =>
            unawaited(stopScreenSharing(error: 'capture_unavailable')),
      );
      final allowed = await _screenService.start(
        notificationTitle: notificationTitle,
        stopLabel: stopLabel,
        stopMessage: stopMessage,
        microphoneActive: state.isMicrophoneActive,
      );
      if (version != _screenVersion) return;
      if (!allowed || isClosed || request != _requestVersion) {
        await stopScreenSharing();
      }
    } on Exception {
      await stopScreenSharing(error: 'capture_unavailable');
    }
  }

  Future<void> _syncScreenMicrophone(bool active) async {
    if (!state.isScreenSharing && !state.isScreenSharingPending) return;
    try {
      await _screenService.setMicrophoneActive(active: active);
    } on Exception {
      await stopScreenSharing(error: 'capture_unavailable');
    }
  }

  Future<void> stopScreenSharing({String? error}) async {
    final version = ++_screenVersion;
    final subscription = _screenSubscription;
    _screenSubscription = null;
    await subscription?.cancel();
    try {
      await _screenService.stop();
    } on Exception {
      // Native capture may already have stopped after system revocation.
    }
    if (!isClosed && version == _screenVersion) {
      _emitMicrophoneState(
        state.copyWith(
          isScreenSharing: false,
          isScreenSharingPending: false,
          screenSharingError: error,
        ),
      );
    }
  }
}
