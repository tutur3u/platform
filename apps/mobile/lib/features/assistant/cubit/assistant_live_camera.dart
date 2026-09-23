part of 'assistant_live_cubit.dart';

extension AssistantLiveCameraControls on AssistantLiveCubit {
  Future<void> toggleCamera() async {
    if (state.isCameraActive) {
      await _cameraService.stopStreaming();
      _emitMicrophoneState(state.copyWith(isCameraActive: false));
      return;
    }

    final screenVersion = _screenVersion + 1;
    await stopScreenSharing();
    if (isClosed || screenVersion != _screenVersion) return;
    final granted = await _cameraService.ensurePermission();
    if (isClosed || screenVersion != _screenVersion) return;
    _emitMicrophoneState(
      state.copyWith(
        cameraPermission: granted
            ? AssistantLivePermissionState.granted
            : AssistantLivePermissionState.denied,
      ),
    );
    if (!granted) {
      _emitError('Camera permission was denied.');
      return;
    }

    final wsId = state.workspaceId;
    if (wsId == null) {
      _emitError('No workspace is selected.');
      return;
    }

    if (state.status != AssistantLiveConnectionStatus.connected) {
      await prepareSession(wsId: wsId, chatId: state.chatId);
    }

    if (isClosed || screenVersion != _screenVersion) return;
    await _cameraService.startStreaming((jpegBytes) {
      if (isClosed || screenVersion != _screenVersion) return;
      _ensureActiveTurn();
      _socket.sendVideoFrame(jpegBytes);
      if (isClosed) {
        return;
      }
      _emitMicrophoneState(
        state.copyWith(
          latestCameraFrame: jpegBytes,
          cameraPermission: AssistantLivePermissionState.granted,
        ),
      );
    });

    if (isClosed || screenVersion != _screenVersion) return;
    _emitMicrophoneState(
      state.copyWith(
        isCameraActive: true,
        latestCameraFrame: _cameraService.latestFrame,
        cameraPermission: AssistantLivePermissionState.granted,
      ),
    );
  }
}
