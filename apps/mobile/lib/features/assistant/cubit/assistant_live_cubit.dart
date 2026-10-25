import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:bloc/bloc.dart';
import 'package:camera/camera.dart';
import 'package:equatable/equatable.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_audio_buffer.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_config.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_screen_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_call_phase.dart';
import 'package:mobile/features/assistant/models/assistant_live_dispatch.dart';
import 'package:mobile/features/assistant/models/assistant_live_history_confirmation.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_startup_timings.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_parts.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_snapshot.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/models/assistant_playback_spectrum.dart';

part 'assistant_live_camera.dart';
part 'assistant_live_microphone.dart';
part 'assistant_live_reconnect.dart';
part 'assistant_live_recovery.dart';
part 'assistant_live_screen.dart';
part 'assistant_live_socket_events.dart';
part 'assistant_live_state.dart';
part 'assistant_live_tools.dart';
part 'assistant_live_persistence.dart';
part 'assistant_live_disposal.dart';
part 'assistant_live_typed_submission.dart';

/// Session-handle cleanup failed after local disconnect teardown completed.
final class AssistantLiveSessionCleanupException implements Exception {
  const AssistantLiveSessionCleanupException();

  @override
  String toString() => 'Assistant live session cleanup failed.';
}

class AssistantLiveCubit extends Cubit<AssistantLiveState> {
  AssistantLiveCubit({
    required AssistantLiveRepository repository,
    required AssistantLiveSocketClient socket,
    required AssistantLiveAudioPlayer audioPlayer,
    required AssistantLiveRecorder recorder,
    required AssistantLiveCameraService cameraService,
    required Future<void> Function(String wsId, String chatId) onChatBound,
    required Future<void> Function(String wsId, String chatId) onHistoryUpdated,
    AssistantLiveTurnConfirmation? isTurnRestored,
    this.screenContextProvider,
    String? Function()? currentUserId,
    int Function()? currentScopeToken,
    AssistantLiveScreenService? screenService,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now,
       _currentScopeToken = currentScopeToken ?? (() => 0),
       _currentUserId = currentUserId ?? currentCacheUserId,
       _repository = repository,
       _socket = socket,
       _audioPlayer = audioPlayer,
       _recorder = recorder,
       _cameraService = cameraService,
       _screenService = screenService ?? AssistantLiveScreenService(),
       _onChatBound = onChatBound,
       _onHistoryUpdated = onHistoryUpdated,
       _isTurnRestored = isTurnRestored,
       super(const AssistantLiveState()) {
    _playbackSubscription = _audioPlayer.activity?.listen((spectrum) {
      if (_manualDisconnect || _isStale(_requestVersion)) return;
      emit(
        state.copyWith(
          assistantAudioLevel: spectrum.energy,
          assistantSpectrum: spectrum.bands,
          isAssistantSpeaking: spectrum.energy > .001,
        ),
      );
    });
    _socketSubscription = _socket.events.listen(
      (event) => unawaited(_dispatchSocketEvent(event)),
    );
  }

  final int Function() _currentScopeToken;
  int _sessionScopeToken = 0;
  final String? Function() _currentUserId;
  String? _sessionUserId;
  final AssistantLiveRepository _repository;
  final AssistantLiveSocketClient _socket;
  final AssistantLiveAudioPlayer _audioPlayer;
  final AssistantLiveRecorder _recorder;
  final AssistantLiveCameraService _cameraService;
  final AssistantLiveScreenService _screenService;
  StreamSubscription<Map<Object?, Object?>>? _screenSubscription;
  int _screenVersion = 0;
  bool get screenSharingAvailable => _screenService.isSupported;
  final Future<void> Function(String wsId, String chatId) _onChatBound;
  final Future<void> Function(String wsId, String chatId) _onHistoryUpdated;
  final AssistantLiveTurnConfirmation? _isTurnRestored;
  final Map<String, dynamic> Function()? screenContextProvider;

  StreamSubscription<AssistantLiveSocketEvent>? _socketSubscription;
  Completer<void>? _readyCompleter;
  int _requestVersion = 0;
  int _preparationVersion = 0;
  int _typedSubmissionVersion = 0;
  int _transportFailureVersion = 0;
  int _disconnectVersion = 0;
  int _conversationVersion = 0;
  Future<void> _pendingPersistence = Future<void>.value();
  final _sealedParts = <AssistantLiveTurnParts>{};
  final _retryTurns = <String, Future<void> Function()>{};
  String _toolProtocol = 'legacy';
  bool _manualDisconnect = false;
  bool _isClosing = false;
  Future<void>? _closeFuture;
  Timer? _reconnectTimer;
  int _reconnectTimerRequest = 0;
  int _reconnectAttempts = 0;
  bool _automaticReconnect = false;
  DateTime? _readyAt;
  final DateTime Function() _now;
  StreamSubscription<AssistantPlaybackSpectrum>? _playbackSubscription;
  final _startupAudio = AssistantAudioBuffer();
  int _microphoneVersion = 0;
  bool _startingMicrophone = false;
  bool _drainingAudio = false;

  String? _currentTurnId;
  String _currentTypedInput = '';
  String _currentUserTranscript = '';
  String _currentAssistantText = '';
  String _currentAssistantTranscript = '';
  List<AssistantAttachment> _currentTurnAttachments = const [];
  AssistantLiveTurnParts _turnParts = AssistantLiveTurnParts();
  Future<void> _pendingTools = Future<void>.value();

  void _emitMicrophoneState(AssistantLiveState next) => emit(next);

  CameraController? get cameraController => _cameraService.controller;

  Future<int?> prepareSession({
    required String wsId,
    String? chatId,
    String? model,
    bool forceFresh = false,
    bool reconnect = false,
    bool Function()? isCurrent,
    Future<void> Function(String wsId, String chatId)? onChatBound,
  }) async {
    // A start the user asked for gets a fresh automatic-reconnect budget.
    if (!_automaticReconnect) _reconnectAttempts = 0;
    final preparationVersion = ++_preparationVersion;
    final admissionVersion = _requestVersion;
    final requestedActor = _currentUserId();
    final requestedScope = _currentScopeToken();
    bool admitted() =>
        preparationVersion == _preparationVersion &&
        (isCurrent?.call() ?? true) &&
        !_isClosing &&
        !isClosed &&
        admissionVersion == _requestVersion &&
        requestedActor == _currentUserId() &&
        requestedScope == _currentScopeToken();
    Future<int?> rejectAdmission() async {
      if (preparationVersion == _preparationVersion &&
          !_isStale(admissionVersion) &&
          state.workspaceId == wsId &&
          state.isBusy &&
          !(isCurrent?.call() ?? true)) {
        await disconnect();
      }
      return null;
    }

    final sameConversation =
        !forceFresh &&
        state.chatId != null &&
        state.workspaceId == wsId &&
        (chatId == null || chatId == state.chatId) &&
        _sessionUserId == _currentUserId() &&
        _sessionScopeToken == _currentScopeToken();
    if (sameConversation) await retryPendingTurns();
    if (!admitted()) return await rejectAdmission();
    if (state.isScreenSharing || state.isScreenSharingPending) {
      await stopScreenSharing();
    }
    if (!admitted()) return await rejectAdmission();
    if (!sameConversation) {
      _conversationVersion++;
      _sealedParts.clear();
      _retryTurns.clear();
      _clearDrafts();
      emit(state.copyWith(completedTurns: const []));
    }
    final requestVersion = ++_requestVersion;
    bool currentRequest() =>
        preparationVersion == _preparationVersion &&
        !_isStale(requestVersion) &&
        (isCurrent?.call() ?? true);
    _sessionUserId = requestedActor;
    _sessionScopeToken = requestedScope;
    _pendingTools = Future<void>.value();
    _manualDisconnect = false;
    _readyCompleter = Completer<void>();
    final timings = AssistantLiveStartupTimings();

    emit(
      state.copyWith(
        workspaceId: wsId,
        hasEnded: false,
        startupTimings: const {},
        status: reconnect
            ? AssistantLiveConnectionStatus.reconnecting
            : AssistantLiveConnectionStatus.preparing,
        clearError: true,
        isInterrupted: false,
      ),
    );

    try {
      final envelope = await timings.measure(
        AssistantLiveStartupPhase.token,
        () => _repository.fetchLiveToken(
          wsId: wsId,
          chatId: chatId ?? state.chatId,
          model: model ?? state.model ?? assistantLiveModelId,
          forceFresh: forceFresh,
        ),
      );
      if (!currentRequest()) {
        return null;
      }

      _toolProtocol = envelope.toolProtocol;
      final sessionHandle = forceFresh ? null : envelope.sessionHandle;

      emit(
        state.copyWith(
          workspaceId: wsId,
          chatId: envelope.chatId,
          scopeKey: envelope.scopeKey,
          model: envelope.model,
          sessionHandle: sessionHandle,
          status: reconnect
              ? AssistantLiveConnectionStatus.reconnecting
              : AssistantLiveConnectionStatus.connecting,
        ),
      );

      // The envelope already carries seed history and the server owns the
      // chat, so binding the visible conversation overlaps the provider
      // handshake instead of gating it. Binding failures stay in the chat view
      // and never fail the call; a late binding publishes its phase timing.
      final binding = timings.measure(
        AssistantLiveStartupPhase.history,
        () => (onChatBound ?? _onChatBound)(wsId, envelope.chatId),
      );
      unawaited(
        binding.then<void>(
          (_) => _publishLateTimings(timings, currentRequest),
          onError: (Object _) => _publishLateTimings(timings, currentRequest),
        ),
      );
      await timings.measure(
        AssistantLiveStartupPhase.audio,
        _audioPlayer.initialize,
      );
      if (!currentRequest()) return null;
      await timings.measure(
        AssistantLiveStartupPhase.socket,
        () => _socket.connect(
          token: envelope.token,
          model: envelope.model,
          seedHistory: envelope.seedHistory,
          sessionHandle: sessionHandle,
        ),
      );
      if (!currentRequest()) return null;
      await timings.measure(AssistantLiveStartupPhase.ready, _waitForReady);
      if (!currentRequest()) {
        return null;
      }

      emit(
        state.copyWith(
          workspaceId: wsId,
          chatId: envelope.chatId,
          scopeKey: envelope.scopeKey,
          model: envelope.model,
          sessionHandle: sessionHandle,
          status: AssistantLiveConnectionStatus.connected,
          clearError: true,
          assistantAudioLevel: 0,
          isAssistantSpeaking: false,
        ),
      );
      // The call is live: record time-to-connected, then hold the caller until
      // the visible conversation is bound, so a typed send captured from it can
      // still be retired by a namespace switch before it dispatches.
      timings.finish();
      await binding.then<void>((_) {}, onError: (Object _) {});
    } on ApiException catch (error) {
      if (!currentRequest()) return null;
      _emitError(error.message);
    } on TimeoutException {
      if (!currentRequest()) return null;
      _emitError('Timed out while connecting to live session.');
    } on Exception catch (error) {
      if (!currentRequest()) return null;
      _emitError(error.toString());
    } finally {
      timings.finish();
      // A retired attempt that still owns the latest request may have opened
      // the provider during binding; close it even if the actor/scope moved.
      if (preparationVersion == _preparationVersion &&
          requestVersion == _requestVersion &&
          !_isClosing &&
          !isClosed &&
          !currentRequest()) {
        await disconnect();
      } else if (currentRequest()) {
        emit(state.copyWith(startupTimings: timings.snapshot));
      }
    }
    return currentRequest() &&
            state.status == AssistantLiveConnectionStatus.connected
        ? requestVersion
        : null;
  }

  void _publishLateTimings(
    AssistantLiveStartupTimings timings,
    bool Function() currentRequest,
  ) {
    if (currentRequest() && state.startupTimings.isNotEmpty) {
      emit(state.copyWith(startupTimings: timings.snapshot));
    }
  }

  Future<AssistantLiveDispatch> sendTypedMessage({
    required String wsId,
    required String text,
    required List<AssistantAttachment> attachments,
    bool Function()? isCurrent,
    Future<void> Function(String wsId, String chatId)? onChatBound,
  }) => _sendTypedMessage(
    wsId: wsId,
    text: text,
    attachments: attachments,
    isCurrent: isCurrent,
    onChatBound: onChatBound,
    publish: emit,
  );

  Future<void> disconnect({
    bool clearSession = false,
    bool finishTurn = false,
    bool reportSessionCleanupFailure = false,
    bool preserveFailure = false,
  }) async {
    final retainFailure =
        preserveFailure && state.status == AssistantLiveConnectionStatus.error;
    final endingVersion = _requestVersion;
    final preparationVersion = _preparationVersion;
    if (finishTurn && _isStale(endingVersion)) return;
    _cancelReconnect();
    _disconnectVersion++;
    if (finishTurn) {
      bool current() =>
          preparationVersion == _preparationVersion && !_isStale(endingVersion);
      await _stopInputs(isCurrent: current);
      if (!current()) return;
    }
    if (!finishTurn) {
      _conversationVersion++;
      _sealedParts.clear();
      _retryTurns.clear();
      emit(state.copyWith(completedTurns: const []));
    }
    _manualDisconnect = true;
    // Seal observed input before closing the wire. Durable persistence uses its
    // conversation lease and must not delay local audio/transport teardown.
    final finishing = finishTurn ? _finalizeTurn() : Future<void>.value();
    final disconnectVersion = ++_requestVersion;
    bool superseded() =>
        preparationVersion != _preparationVersion ||
        (finishTurn
            ? _isStale(disconnectVersion)
            : isClosed || disconnectVersion != _requestVersion);
    await _stopInputs(isCurrent: () => !superseded());
    if (superseded()) return;
    await _socket.disconnect();
    if (superseded()) return;
    await _audioPlayer.pause();
    if (superseded()) return;
    _clearAssistantActivity();
    emit(
      state.copyWith(
        status: retainFailure
            ? AssistantLiveConnectionStatus.error
            : AssistantLiveConnectionStatus.disconnected,
        hasEnded: finishTurn,
        isInterrupted: false,
        audioLevel: 0,
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
        clearError: !finishTurn && !retainFailure,
      ),
    );
    await finishing;
    if (finishTurn) await _pendingPersistence;
    if (superseded()) return;

    AssistantLiveSessionCleanupException? sessionCleanupFailure;
    final wsId = state.workspaceId;
    final scopeKey = state.scopeKey;
    if (clearSession && wsId != null && scopeKey != null) {
      try {
        final actor = _sessionUserId;
        Future<void> clearHandle() =>
            _repository.clearSessionHandle(wsId: wsId, scopeKey: scopeKey);
        if (actor == null) {
          await clearHandle();
        } else {
          await ApiClient.runForUser(actor, clearHandle);
        }
        if (superseded()) return;
      } on Exception {
        if (reportSessionCleanupFailure) {
          sessionCleanupFailure = const AssistantLiveSessionCleanupException();
        }
      }
    }

    _clearDrafts();
    emit(
      state.copyWith(
        status: retainFailure
            ? AssistantLiveConnectionStatus.error
            : AssistantLiveConnectionStatus.disconnected,
        hasEnded: finishTurn,
        sessionHandle: clearSession ? null : state.sessionHandle,
        isInterrupted: false,
        audioLevel: 0,
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
        clearError: !finishTurn && !retainFailure,
      ),
    );
    if (sessionCleanupFailure != null) throw sessionCleanupFailure;
  }

  Future<void> startNewConversation(String wsId) async {
    await disconnect(clearSession: true);
    emit(
      state.copyWith(
        chatId: null,
        scopeKey: null,
        latestCameraFrame: null,
        insightCards: const [],
      ),
    );
    await prepareSession(
      wsId: wsId,
      model: assistantLiveModelId,
      forceFresh: true,
    );
  }

  Future<void> retry() async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      return;
    }
    await prepareSession(
      wsId: wsId,
      chatId: state.chatId,
      reconnect: state.chatId != null,
    );
  }

  void _emitSessionHandle(String? handle) {
    if (!isClosed) emit(state.copyWith(sessionHandle: handle));
  }

  Future<void> _waitForReady() async {
    final completer = _readyCompleter;
    if (state.status == AssistantLiveConnectionStatus.connected ||
        completer == null) {
      return;
    }
    await completer.future.timeout(const Duration(seconds: 20));
  }

  bool _isStale(int requestVersion) =>
      _isClosing ||
      isClosed ||
      requestVersion != _requestVersion ||
      _currentUserId() != _sessionUserId ||
      _currentScopeToken() != _sessionScopeToken;

  void _ensureActiveTurn() {
    _currentTurnId ??= _newTurnId();
  }

  String _resolvedUserContent() {
    if (_currentTypedInput.trim().isNotEmpty) {
      return _currentTypedInput.trim();
    }
    return _currentUserTranscript.trim();
  }

  String _resolvedAssistantContent() {
    if (_currentAssistantText.trim().isNotEmpty) {
      return _currentAssistantText.trim();
    }
    return _currentAssistantTranscript.trim();
  }

  Map<String, dynamic> _serializeAttachment(AssistantAttachment attachment) => {
    'id': attachment.id,
    'name': attachment.name,
    'type': attachment.type,
    'size': attachment.size,
    'storagePath': attachment.storagePath,
    'signedUrl': attachment.signedUrl,
  };

  AssistantLiveInsightCard? _buildInsightCard(
    AssistantLiveFunctionCall call,
    Map<String, dynamic> result,
  ) {
    final title =
        (result['title'] as String?) ??
        (result['sectionTitle'] as String?) ??
        call.name.replaceAll('_', ' ');
    final body =
        (result['summary'] as String?) ??
        (result['message'] as String?) ??
        (result['text'] as String?) ??
        (result['description'] as String?);
    if (body == null || body.trim().isEmpty) {
      return null;
    }

    return AssistantLiveInsightCard(
      id: '${call.name}-${call.id}',
      title: title,
      body: body.trim(),
      kind: result['kind'] as String? ?? 'info',
    );
  }

  String? _buildAttachmentSummary(List<AssistantAttachment> attachments) {
    if (attachments.isEmpty) {
      return null;
    }

    final names = attachments.map((attachment) => attachment.name).join(', ');
    return 'Attached file context: $names';
  }

  String _mergeProgressiveText(String current, String incoming) {
    if (incoming.isEmpty) {
      return current;
    }
    if (current.isEmpty) {
      return incoming;
    }
    if (incoming.startsWith(current)) {
      return incoming;
    }
    if (current.endsWith(incoming)) {
      return current;
    }
    return '$current$incoming';
  }

  int _lastTurnTimestamp = 0;
  String _newTurnId() {
    final now = DateTime.now().microsecondsSinceEpoch;
    _lastTurnTimestamp = now > _lastTurnTimestamp
        ? now
        : _lastTurnTimestamp + 1;
    return 'live-$_lastTurnTimestamp';
  }

  void _clearDrafts() {
    _currentTurnId = null;
    _currentTypedInput = '';
    _currentUserTranscript = '';
    _currentAssistantText = '';
    _currentAssistantTranscript = '';
    _currentTurnAttachments = const [];
    _turnParts = AssistantLiveTurnParts();

    if (isClosed) {
      return;
    }

    emit(
      state.copyWith(
        userDraft: '',
        userTranscript: '',
        assistantDraft: '',
        assistantTranscript: '',
        assistantParts: const [],
        isInterrupted: false,
      ),
    );
  }

  void _emitError(String message, {bool preserveDrafts = false}) {
    if (isClosed) {
      return;
    }

    emit(
      state.copyWith(
        status: AssistantLiveConnectionStatus.error,
        error: message,
        isPersisting: false,
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
      ),
    );
    unawaited(stopScreenSharing());
    if (!preserveDrafts) {
      _microphoneVersion++;
      _startingMicrophone = false;
      _startupAudio.clear();
      unawaited(_stopRecorderSafely());
      emit(state.copyWith(isMicrophoneActive: false, audioLevel: 0));
      _clearDrafts();
    }
  }

  Future<void> _cancelSocketEvents() async =>
      await _socketSubscription?.cancel();
  Future<void> _cancelPlayback() async => await _playbackSubscription?.cancel();
  Future<void> _cancelScreenEvents() async =>
      await _screenSubscription?.cancel();

  /// Every emission advances the call clock in one place, so connect,
  /// reconnect and end paths cannot disagree about the elapsed call time.
  @override
  void emit(AssistantLiveState state) => super.emit(
    applyAssistantLiveCallClock(this.state, state, DateTime.now()),
  );

  @override
  Future<void> close() {
    if (_closeFuture != null) return _closeFuture!;
    final completion = Completer<void>();
    _closeFuture = completion.future;
    unawaited(
      _disposeLive(super.close).then<void>(
        (_) => completion.complete(),
        onError: completion.completeError,
      ),
    );
    return completion.future;
  }

  void _clearAssistantActivity() {
    if (isClosed) {
      return;
    }
    emit(state.copyWith(assistantAudioLevel: 0, isAssistantSpeaking: false));
  }
}
