part of 'assistant_live_cubit.dart';

extension _AssistantLiveSocketEvents on AssistantLiveCubit {
  Future<void> _handleSocketEvent(AssistantLiveSocketEvent event) async {
    switch (event) {
      case AssistantLiveSocketConnected():
        _emitMicrophoneState(
          state.copyWith(
            status: AssistantLiveConnectionStatus.connecting,
            clearError: true,
          ),
        );
      case AssistantLiveSocketReady():
        if (!(_readyCompleter?.isCompleted ?? true)) {
          _readyCompleter?.complete();
        }
        _emitMicrophoneState(
          state.copyWith(
            status: AssistantLiveConnectionStatus.connected,
            clearError: true,
          ),
        );
        unawaited(_drainStartupAudio());
      case AssistantLiveSocketClosed(:final reason):
        unawaited(stopScreenSharing());
        if (_manualDisconnect) {
          _emitMicrophoneState(
            state.copyWith(
              status: AssistantLiveConnectionStatus.disconnected,
              audioLevel: 0,
            ),
          );
          return;
        }
        _emitMicrophoneState(
          state.copyWith(
            status: AssistantLiveConnectionStatus.reconnecting,
            error: reason.isEmpty ? state.error : reason,
          ),
        );
        _scheduleReconnect();
      case AssistantLiveSocketError(:final message):
        unawaited(stopScreenSharing());
        _emitMicrophoneState(
          state.copyWith(
            status: AssistantLiveConnectionStatus.error,
            error: message,
          ),
        );
        _scheduleReconnect();
      case AssistantLiveSocketTextDelta(:final text):
        _ensureActiveTurn();
        final previousText = _currentAssistantText;
        _currentAssistantText = _mergeProgressiveText(
          _currentAssistantText,
          text,
        );
        _turnParts.appendText(previousText, _currentAssistantText);
        _emitMicrophoneState(
          state.copyWith(
            assistantDraft: _currentAssistantText,
            assistantParts: _turnParts.parts,
            isInterrupted: false,
          ),
        );
      case AssistantLiveSocketTranscriptDelta(:final text, :final isUserInput):
        _ensureActiveTurn();
        if (isUserInput) {
          _currentUserTranscript = _mergeProgressiveText(
            _currentUserTranscript,
            text,
          );
          _emitMicrophoneState(
            state.copyWith(userTranscript: _currentUserTranscript),
          );
        } else {
          final previousTranscript = _currentAssistantTranscript;
          _currentAssistantTranscript = _mergeProgressiveText(
            _currentAssistantTranscript,
            text,
          );
          _turnParts.appendText(
            previousTranscript,
            _currentAssistantTranscript,
            transcript: true,
          );
          _emitMicrophoneState(
            state.copyWith(
              assistantTranscript: _currentAssistantTranscript,
              assistantParts: _turnParts.parts,
            ),
          );
        }
      case AssistantLiveSocketAudioChunk(:final bytes, :final mimeType):
        final format = mimeType.toLowerCase().replaceAll(' ', '');
        if (format != 'audio/pcm' && format != 'audio/pcm;rate=24000') {
          throw const FormatException('Unsupported Live audio format');
        }
        await _audioPlayer.play(bytes);
      case AssistantLiveSocketInterrupted():
        final interruptedTurn = _finalizeTurn();
        await _audioPlayer.clear();
        _clearAssistantActivity();
        _emitMicrophoneState(state.copyWith(isInterrupted: true));
        await interruptedTurn;
      case AssistantLiveSocketTurnCompleted():
        await _finalizeTurn();
      case AssistantLiveSocketGoAway(:final timeLeft):
        unawaited(stopScreenSharing());
        _emitMicrophoneState(
          state.copyWith(
            status: AssistantLiveConnectionStatus.reconnecting,
            goAwayTimeLeft: timeLeft,
          ),
        );
        _scheduleReconnect();
      case AssistantLiveSocketSessionHandleUpdated(
        :final resumable,
        :final newHandle,
      ):
        await _persistSessionHandle(resumable, newHandle);
      case AssistantLiveSocketToolCall(:final calls):
        await _executeToolCalls(calls);
    }
  }
}
