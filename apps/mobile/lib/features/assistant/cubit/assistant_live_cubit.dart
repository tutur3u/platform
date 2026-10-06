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
import 'package:mobile/features/assistant/models/assistant_live_history_confirmation.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_startup_timings.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_parts.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_snapshot.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/models/assistant_playback_spectrum.dart';

part 'assistant_live_camera.dart';
part 'assistant_live_microphone.dart';
part 'assistant_live_recovery.dart';
part 'assistant_live_screen.dart';
part 'assistant_live_socket_events.dart';
part 'assistant_live_state.dart';
part 'assistant_live_tools.dart';
part 'assistant_live_persistence.dart';
part 'assistant_live_disposal.dart';

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
  }) : _currentScopeToken = currentScopeToken ?? (() => 0),
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
  int _conversationVersion = 0;
  Future<void> _pendingPersistence = Future<void>.value();
  final _sealedParts = <AssistantLiveTurnParts>{};
  final _retryTurns = <String, Future<void> Function()>{};
  String _toolProtocol = 'legacy';
  bool _manualDisconnect = false;
  bool _isClosing = false;
  Future<void>? _closeFuture;
  bool _reconnectScheduled = false;
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

  Future<void> prepareSession({
    required String wsId,
    String? chatId,
    String? model,
    bool forceFresh = false,
    bool reconnect = false,
  }) async {
    final admissionVersion = _requestVersion;
    final requestedActor = _currentUserId();
    final requestedScope = _currentScopeToken();
    bool admitted() =>
        !_isClosing &&
        !isClosed &&
        admissionVersion == _requestVersion &&
        requestedActor == _currentUserId() &&
        requestedScope == _currentScopeToken();
    final sameConversation =
        !forceFresh &&
        state.chatId != null &&
        state.workspaceId == wsId &&
        (chatId == null || chatId == state.chatId) &&
        _sessionUserId == _currentUserId() &&
        _sessionScopeToken == _currentScopeToken();
    if (sameConversation) await retryPendingTurns();
    if (!admitted()) return;
    if (state.isScreenSharing || state.isScreenSharingPending) {
      await stopScreenSharing();
    }
    if (!admitted()) return;
    if (!sameConversation) {
      _conversationVersion++;
      _sealedParts.clear();
      _retryTurns.clear();
      _clearDrafts();
      emit(state.copyWith(completedTurns: const []));
    }
    final requestVersion = ++_requestVersion;
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
      if (_isStale(requestVersion)) {
        return;
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

      // Both operations are independent, but chat ownership and native media
      // must be ready before exposing the provider connection. Settle both even
      // if one fails so no background startup error escapes the owned attempt.
      await Future.wait<void>([
        timings.measure(
          AssistantLiveStartupPhase.history,
          () => _onChatBound(wsId, envelope.chatId),
        ),
        timings.measure(
          AssistantLiveStartupPhase.audio,
          _audioPlayer.initialize,
        ),
      ]);
      if (_isStale(requestVersion)) return;
      await timings.measure(
        AssistantLiveStartupPhase.socket,
        () => _socket.connect(
          token: envelope.token,
          model: envelope.model,
          seedHistory: envelope.seedHistory,
          sessionHandle: sessionHandle,
        ),
      );
      if (_isStale(requestVersion)) return;
      await timings.measure(AssistantLiveStartupPhase.ready, _waitForReady);
      if (_isStale(requestVersion)) {
        return;
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
    } on ApiException catch (error) {
      if (_isStale(requestVersion)) return;
      _emitError(error.message);
    } on TimeoutException {
      if (_isStale(requestVersion)) return;
      _emitError('Timed out while connecting to live session.');
    } on Exception catch (error) {
      if (_isStale(requestVersion)) return;
      _emitError(error.toString());
    } finally {
      timings.finish();
      if (!_isStale(requestVersion)) {
        emit(state.copyWith(startupTimings: timings.snapshot));
      }
    }
  }

  Future<void> sendTypedMessage({
    required String wsId,
    required String text,
    required List<AssistantAttachment> attachments,
  }) async {
    final trimmed = text.trim();
    final uploadedAttachments = attachments
        .where((attachment) => attachment.isUploaded)
        .toList(growable: false);
    if (trimmed.isEmpty && uploadedAttachments.isEmpty) {
      return;
    }

    if (state.status != AssistantLiveConnectionStatus.connected) {
      await prepareSession(wsId: wsId, chatId: state.chatId);
    } else {
      await _waitForReady();
    }

    _currentTurnId = _newTurnId();
    _currentTypedInput = trimmed;
    _currentUserTranscript = '';
    _currentAssistantText = '';
    _currentAssistantTranscript = '';
    _currentTurnAttachments = uploadedAttachments;
    _turnParts = AssistantLiveTurnParts();

    emit(
      state.copyWith(
        userDraft: trimmed,
        userTranscript: '',
        assistantDraft: '',
        assistantTranscript: '',
        assistantParts: const [],
        isInterrupted: false,
      ),
    );

    for (final attachment in uploadedAttachments.where(
      (file) => file.isImage,
    )) {
      await _sendImageAttachment(attachment);
    }

    final summary = _buildAttachmentSummary(uploadedAttachments);
    final payload = [
      if (summary != null) summary,
      if (trimmed.isNotEmpty) trimmed,
    ].join('\n\n');

    if (payload.trim().isNotEmpty) {
      _socket.sendText(payload);
    }
  }

  Future<void> disconnect({
    bool clearSession = false,
    bool finishTurn = false,
  }) async {
    final endingVersion = _requestVersion;
    if (finishTurn) {
      if (_isStale(endingVersion)) return;
      await _stopInputs();
      if (_isStale(endingVersion)) return;
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
    bool superseded() => finishTurn
        ? _isStale(disconnectVersion)
        : isClosed || disconnectVersion != _requestVersion;
    await _stopInputs();
    if (superseded()) return;
    await _socket.disconnect();
    if (superseded()) return;
    await _audioPlayer.pause();
    if (superseded()) return;
    _clearAssistantActivity();
    emit(
      state.copyWith(
        status: AssistantLiveConnectionStatus.disconnected,
        hasEnded: finishTurn,
        isInterrupted: false,
        audioLevel: 0,
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
        clearError: !finishTurn,
      ),
    );
    await finishing;
    if (finishTurn) await _pendingPersistence;
    if (superseded()) return;

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
        // Ignore cleanup failures on manual disconnect.
      }
    }

    _clearDrafts();
    emit(
      state.copyWith(
        status: AssistantLiveConnectionStatus.disconnected,
        hasEnded: finishTurn,
        sessionHandle: clearSession ? null : state.sessionHandle,
        isInterrupted: false,
        audioLevel: 0,
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
        clearError: !finishTurn,
      ),
    );
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

  void _scheduleReconnect() {
    if (_manualDisconnect || _reconnectScheduled || state.workspaceId == null) {
      return;
    }

    _reconnectScheduled = true;
    final requestVersion = _requestVersion;
    final wsId = state.workspaceId!;
    final chatId = state.chatId;
    final model = state.model;

    unawaited(
      Future<void>.delayed(const Duration(milliseconds: 800), () async {
        try {
          if (_manualDisconnect || _isStale(requestVersion)) return;
          await prepareSession(
            wsId: wsId,
            chatId: chatId,
            model: model,
            reconnect: true,
          );
        } finally {
          _reconnectScheduled = false;
        }
      }),
    );
  }

  Future<void> _sendImageAttachment(AssistantAttachment attachment) async {
    final path = attachment.localPath;
    if (path == null || path.isEmpty) {
      return;
    }

    final rawBytes = await File(path).readAsBytes();
    final decoded = img.decodeImage(rawBytes);
    if (decoded == null) {
      return;
    }

    final jpegBytes = Uint8List.fromList(img.encodeJpg(decoded, quality: 72));
    _socket.sendVideoFrame(jpegBytes);
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
