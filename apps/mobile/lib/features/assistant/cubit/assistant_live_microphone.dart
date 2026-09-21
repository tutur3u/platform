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
      await _recorder.stop();
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
        onAmplitude: (level) {
          if (!isClosed && version == _microphoneVersion) {
            _emitMicrophoneState(state.copyWith(audioLevel: level));
          }
        },
      );
      if (isClosed || version != _microphoneVersion) {
        await _recorder.stop();
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
    } on Exception catch (error) {
      if (!isClosed && version == _microphoneVersion) {
        _microphoneVersion++;
        _startupAudio.clear();
        await _recorder.stop();
        if (!isClosed) {
          _emitMicrophoneState(
            state.copyWith(isMicrophoneActive: false, audioLevel: 0),
          );
          _emitError(error.toString());
        }
      }
    } finally {
      _startingMicrophone = false;
    }
  }
}
