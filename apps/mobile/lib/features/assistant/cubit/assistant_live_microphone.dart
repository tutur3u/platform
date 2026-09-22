part of 'assistant_live_cubit.dart';

extension _AssistantLiveMicrophone on AssistantLiveCubit {
  Future<void> _drainStartupAudio() async {
    if (_drainingAudio) return;
    _drainingAudio = true;
    final version = _microphoneVersion;
    try {
      while (!isClosed &&
          version == _microphoneVersion &&
          state.status == AssistantLiveConnectionStatus.connected) {
        final bytes = _startupAudio.take();
        if (bytes == null) break;
        _ensureActiveTurn();
        _socket.sendAudioChunk(bytes);
        // Yield so cancellation and socket events stay responsive.
        await Future<void>.delayed(Duration.zero);
      }
    } finally {
      _drainingAudio = false;
    }
  }
}

extension AssistantLiveMicrophoneControls on AssistantLiveCubit {
  Future<void> toggleMicrophone() async {
    if (state.isMicrophoneActive || _startingMicrophone) {
      _microphoneVersion++;
      _startupAudio.clear();
      await _stopRecorderSafely();
      _socket.endAudioStream();
      if (!isClosed) {
        _emitMicrophoneState(
          state.copyWith(isMicrophoneActive: false, audioLevel: 0),
        );
      }
      return;
    }
    final version = ++_microphoneVersion;
    _startingMicrophone = true;
    try {
      final granted = await _recorder.ensurePermission();
      if (isClosed || version != _microphoneVersion) return;
      _emitMicrophoneState(
        state.copyWith(
          microphonePermission: granted
              ? AssistantLivePermissionState.granted
              : AssistantLivePermissionState.denied,
        ),
      );
      if (!granted) {
        _emitError('Microphone permission was denied.');
        return;
      }
      final wsId = state.workspaceId;
      if (wsId == null) return;
      // Configure playback before capture; changing the shared iOS audio
      // category after the microphone starts can invalidate its input route.
      await _audioPlayer.initialize();
      if (isClosed || version != _microphoneVersion) return;
      await _recorder.start(
        onData: (bytes) {
          if (isClosed || version != _microphoneVersion) return;
          if (!_startupAudio.add(bytes)) {
            unawaited(toggleMicrophone());
            _emitError('Connection took too long. Please try recording again.');
            return;
          }
          if (state.status == AssistantLiveConnectionStatus.connected) {
            unawaited(_drainStartupAudio());
          }
        },
        onError: (_) {
          if (!isClosed && version == _microphoneVersion) {
            _emitError('microphone_unavailable');
          }
        },
        onAmplitude: (level) {
          if (!isClosed && version == _microphoneVersion) {
            _emitMicrophoneState(state.copyWith(audioLevel: level));
          }
        },
      );
      if (isClosed || version != _microphoneVersion) {
        await _stopRecorderSafely();
        return;
      }
      _emitMicrophoneState(state.copyWith(isMicrophoneActive: true));
      if (state.isBusy) {
        await _waitForReady();
      } else if (state.status != AssistantLiveConnectionStatus.connected) {
        await prepareSession(wsId: wsId, chatId: state.chatId);
      }
      if (version != _microphoneVersion || isClosed) return;
      if (state.status == AssistantLiveConnectionStatus.connected) {
        await _drainStartupAudio();
      } else {
        await toggleMicrophone();
      }
    } on Exception {
      if (!isClosed && version == _microphoneVersion) {
        _microphoneVersion++;
        _startupAudio.clear();
        await _stopRecorderSafely();
        if (!isClosed) {
          _emitMicrophoneState(
            state.copyWith(isMicrophoneActive: false, audioLevel: 0),
          );
          _emitError('microphone_unavailable');
        }
      }
    } finally {
      _startingMicrophone = false;
    }
  }
}
