part of 'assistant_live_cubit.dart';

extension _AssistantLiveConsent on AssistantLiveCubit {
  /// Whether a Live start must first wait for the user's AI data consent.
  bool get _aiConsentPending => !(aiConsentGate?.granted ?? true);

  /// Asks for consent before any token request. A refusal ends the start
  /// with a failure, so a microphone opened alongside it is released.
  Future<bool> _admitLiveAiConsent() async {
    final gate = aiConsentGate;
    if (gate == null || gate.granted || await gate.request()) return true;
    if (!isClosed && !_isClosing) {
      _emitError(AssistantLiveFailure.aiConsentRequired);
    }
    return false;
  }

  void _publishLateTimings(
    AssistantLiveStartupTimings timings,
    bool Function() currentRequest,
  ) {
    if (currentRequest() && state.startupTimings.isNotEmpty) {
      _emitMicrophoneState(state.copyWith(startupTimings: timings.snapshot));
    }
  }
}
