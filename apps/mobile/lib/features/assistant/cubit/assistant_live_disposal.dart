part of 'assistant_live_cubit.dart';

extension _AssistantLiveDisposal on AssistantLiveCubit {
  Future<void> _disposeLive(Future<void> Function() closeState) async {
    // Close admission synchronously; Bloc closes only after native teardown.
    _isClosing = true;
    _requestVersion++;
    _conversationVersion++;
    _manualDisconnect = true;
    _retryTurns.clear();
    _sealedParts.clear();

    Object? failure;
    StackTrace? failureStack;
    Future<void> cleanup(Future<void> Function() operation) async {
      try {
        await operation();
      } on Object catch (error, stack) {
        failure ??= error;
        failureStack ??= stack;
      }
    }

    await cleanup(_cancelSocketEvents);
    await cleanup(_cancelPlayback);
    await cleanup(_cancelScreenEvents);
    _screenSubscription = null;
    await cleanup(_stopInputs);
    await cleanup(_socket.disconnect);
    await cleanup(_audioPlayer.dispose);
    await cleanup(_recorder.dispose);
    await cleanup(_cameraService.dispose);
    await cleanup(() async => _socket.dispose());
    await cleanup(closeState);
    if (failure != null) Error.throwWithStackTrace(failure!, failureStack!);
  }
}
