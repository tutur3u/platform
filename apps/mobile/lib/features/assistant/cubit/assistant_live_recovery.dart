part of 'assistant_live_cubit.dart';

extension _AssistantLiveRecovery on AssistantLiveCubit {
  Future<void> _persistSessionHandle(bool resumable, String? newHandle) async {
    final version = _requestVersion;
    final wsId = state.workspaceId;
    final scopeKey = state.scopeKey;
    if (wsId == null || scopeKey == null) return;
    try {
      if (resumable && newHandle != null && newHandle.isNotEmpty) {
        await _repository.storeSessionHandle(
          wsId: wsId,
          scopeKey: scopeKey,
          sessionHandle: newHandle,
        );
        if (!_isStale(version)) _emitSessionHandle(newHandle);
      } else {
        await _repository.clearSessionHandle(wsId: wsId, scopeKey: scopeKey);
        if (!_isStale(version)) _emitSessionHandle(null);
      }
    } on Exception {
      // Resume storage is optional; a disk failure must not stop a live call.
    }
  }

  Future<void> _dispatchSocketEvent(AssistantLiveSocketEvent event) async {
    final requestVersion = _requestVersion;
    if (_manualDisconnect || _isStale(requestVersion)) return;
    try {
      await _handleSocketEvent(event);
    } on Exception {
      if (_isStale(requestVersion)) return;
      await _stopInputs();
      if (_isStale(requestVersion)) return;
      _emitError('live_audio_unavailable', preserveDrafts: true);
    }
  }

  Future<void> _stopRecorderSafely() async {
    try {
      await _recorder.stop();
    } on Exception {
      // Cleanup must not replace the original recoverable device error.
    }
  }

  Future<void> _stopInputs() async {
    _microphoneVersion++;
    _startupAudio.clear();
    await stopScreenSharing();
    await _stopRecorderSafely();
    try {
      await _cameraService.stopStreaming();
    } on Exception {
      // Native media may already have stopped after an interruption.
    }
    if (isClosed) return;
    _emitMicrophoneState(
      state.copyWith(
        isMicrophoneActive: false,
        isCameraActive: false,
        audioLevel: 0,
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
      ),
    );
  }
}
