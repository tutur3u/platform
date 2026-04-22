import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:bloc/bloc.dart';
import 'package:camera/camera.dart';
import 'package:equatable/equatable.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_config.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

part 'assistant_live_state.dart';

class AssistantLiveCubit extends Cubit<AssistantLiveState> {
  AssistantLiveCubit({
    required AssistantLiveRepository repository,
    required AssistantLiveSocketClient socket,
    required AssistantLiveAudioPlayer audioPlayer,
    required AssistantLiveRecorder recorder,
    required AssistantLiveCameraService cameraService,
    required Future<void> Function(String wsId, String chatId) onChatBound,
    required Future<void> Function(String wsId, String chatId) onHistoryUpdated,
  }) : _repository = repository,
       _socket = socket,
       _audioPlayer = audioPlayer,
       _recorder = recorder,
       _cameraService = cameraService,
       _onChatBound = onChatBound,
       _onHistoryUpdated = onHistoryUpdated,
       super(const AssistantLiveState()) {
    _socketSubscription = _socket.events.listen(
      (event) => unawaited(_handleSocketEvent(event)),
    );
  }

  final AssistantLiveRepository _repository;
  final AssistantLiveSocketClient _socket;
  final AssistantLiveAudioPlayer _audioPlayer;
  final AssistantLiveRecorder _recorder;
  final AssistantLiveCameraService _cameraService;
  final Future<void> Function(String wsId, String chatId) _onChatBound;
  final Future<void> Function(String wsId, String chatId) _onHistoryUpdated;

  StreamSubscription<AssistantLiveSocketEvent>? _socketSubscription;
  Completer<void>? _readyCompleter;
  int _requestVersion = 0;
  bool _manualDisconnect = false;
  bool _reconnectScheduled = false;
  Timer? _assistantSpeakingTimer;

  String? _currentTurnId;
  String _currentTypedInput = '';
  String _currentUserTranscript = '';
  String _currentAssistantText = '';
  String _currentAssistantTranscript = '';
  List<AssistantAttachment> _currentTurnAttachments = const [];
  final List<Map<String, dynamic>> _currentToolCalls = [];
  final List<Map<String, dynamic>> _currentToolResults = [];

  CameraController? get cameraController => _cameraService.controller;

  Future<void> prepareSession({
    required String wsId,
    String? chatId,
    String? model,
    bool forceFresh = false,
    bool reconnect = false,
  }) async {
    final requestVersion = ++_requestVersion;
    _manualDisconnect = false;
    _readyCompleter = Completer<void>();

    emit(
      state.copyWith(
        workspaceId: wsId,
        status: reconnect
            ? AssistantLiveConnectionStatus.reconnecting
            : AssistantLiveConnectionStatus.preparing,
        clearError: true,
        isInterrupted: false,
      ),
    );

    try {
      final envelope = await _repository.fetchLiveToken(
        wsId: wsId,
        chatId: chatId ?? state.chatId,
        model: model ?? state.model ?? assistantLiveModelId,
      );
      if (_isStale(requestVersion)) {
        return;
      }

      final sessionHandle = forceFresh
          ? null
          : await _repository.fetchSessionHandle(
              wsId: wsId,
              scopeKey: envelope.scopeKey,
            );
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
          status: reconnect
              ? AssistantLiveConnectionStatus.reconnecting
              : AssistantLiveConnectionStatus.connecting,
        ),
      );

      await _onChatBound(wsId, envelope.chatId);
      if (_isStale(requestVersion)) {
        return;
      }

      await _audioPlayer.initialize();
      await _socket.connect(
        token: envelope.token,
        model: envelope.model,
        seedHistory: envelope.seedHistory,
        sessionHandle: sessionHandle,
      );
      await _waitForReady();
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
      _emitError(error.message);
    } on TimeoutException {
      _emitError('Timed out while connecting to live session.');
    } on Exception catch (error) {
      _emitError(error.toString());
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
    _currentToolCalls.clear();
    _currentToolResults.clear();

    emit(
      state.copyWith(
        userDraft: trimmed,
        userTranscript: '',
        assistantDraft: '',
        assistantTranscript: '',
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

  Future<void> toggleMicrophone() async {
    if (state.isMicrophoneActive) {
      await _recorder.stop();
      emit(
        state.copyWith(
          isMicrophoneActive: false,
          audioLevel: 0,
        ),
      );
      return;
    }

    final granted = await _recorder.ensurePermission();
    emit(
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
    if (wsId == null) {
      _emitError('No workspace is selected.');
      return;
    }

    if (state.status != AssistantLiveConnectionStatus.connected) {
      await prepareSession(wsId: wsId, chatId: state.chatId);
    }

    await _recorder.start(
      onData: (bytes) {
        _ensureActiveTurn();
        _socket.sendAudioChunk(bytes);
      },
      onAmplitude: (level) {
        if (isClosed) {
          return;
        }
        emit(state.copyWith(audioLevel: level));
      },
    );

    emit(
      state.copyWith(
        isMicrophoneActive: true,
        microphonePermission: AssistantLivePermissionState.granted,
      ),
    );
  }

  Future<void> toggleCamera() async {
    if (state.isCameraActive) {
      await _cameraService.stopStreaming();
      emit(state.copyWith(isCameraActive: false));
      return;
    }

    final granted = await _cameraService.ensurePermission();
    emit(
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

    await _cameraService.startStreaming((jpegBytes) {
      _ensureActiveTurn();
      _socket.sendVideoFrame(jpegBytes);
      if (isClosed) {
        return;
      }
      emit(
        state.copyWith(
          latestCameraFrame: jpegBytes,
          cameraPermission: AssistantLivePermissionState.granted,
        ),
      );
    });

    emit(
      state.copyWith(
        isCameraActive: true,
        latestCameraFrame: _cameraService.latestFrame,
        cameraPermission: AssistantLivePermissionState.granted,
      ),
    );
  }

  Future<void> disconnect({bool clearSession = false}) async {
    _manualDisconnect = true;
    _requestVersion++;
    await _stopInputs();
    await _socket.disconnect();
    await _audioPlayer.clear();
    _clearAssistantActivity();

    final wsId = state.workspaceId;
    final scopeKey = state.scopeKey;
    if (clearSession && wsId != null && scopeKey != null) {
      try {
        await _repository.clearSessionHandle(wsId: wsId, scopeKey: scopeKey);
      } on Exception {
        // Ignore cleanup failures on manual disconnect.
      }
    }

    _clearDrafts();
    emit(
      state.copyWith(
        status: AssistantLiveConnectionStatus.disconnected,
        sessionHandle: clearSession ? null : state.sessionHandle,
        isInterrupted: false,
        audioLevel: 0,
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
        clearError: true,
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

  Future<void> _handleSocketEvent(AssistantLiveSocketEvent event) async {
    switch (event) {
      case AssistantLiveSocketConnected():
        emit(
          state.copyWith(
            status: AssistantLiveConnectionStatus.connecting,
            clearError: true,
          ),
        );
      case AssistantLiveSocketReady():
        _readyCompleter?.complete();
        emit(
          state.copyWith(
            status: AssistantLiveConnectionStatus.connected,
            clearError: true,
          ),
        );
      case AssistantLiveSocketClosed(:final reason):
        if (_manualDisconnect) {
          emit(
            state.copyWith(
              status: AssistantLiveConnectionStatus.disconnected,
              audioLevel: 0,
            ),
          );
          return;
        }
        emit(
          state.copyWith(
            status: AssistantLiveConnectionStatus.reconnecting,
            error: reason.isEmpty ? state.error : reason,
          ),
        );
        _scheduleReconnect();
      case AssistantLiveSocketError(:final message):
        emit(
          state.copyWith(
            status: AssistantLiveConnectionStatus.error,
            error: message,
          ),
        );
        _scheduleReconnect();
      case AssistantLiveSocketTextDelta(:final text):
        _ensureActiveTurn();
        _markAssistantActivity(textOnly: true);
        _currentAssistantText = _mergeProgressiveText(
          _currentAssistantText,
          text,
        );
        emit(
          state.copyWith(
            assistantDraft: _currentAssistantText,
            isInterrupted: false,
          ),
        );
      case AssistantLiveSocketTranscriptDelta(
        :final text,
        :final isUserInput,
      ):
        _ensureActiveTurn();
        if (isUserInput) {
          _currentUserTranscript = _mergeProgressiveText(
            _currentUserTranscript,
            text,
          );
          emit(state.copyWith(userTranscript: _currentUserTranscript));
        } else {
          _currentAssistantTranscript = _mergeProgressiveText(
            _currentAssistantTranscript,
            text,
          );
          emit(
            state.copyWith(
              assistantTranscript: _currentAssistantTranscript,
            ),
          );
        }
      case AssistantLiveSocketAudioChunk(:final bytes):
        _markAssistantActivity(chunkBytes: bytes);
        await _audioPlayer.play(bytes);
      case AssistantLiveSocketInterrupted():
        await _audioPlayer.clear();
        _clearAssistantActivity();
        emit(state.copyWith(isInterrupted: true));
      case AssistantLiveSocketTurnCompleted():
        _clearAssistantActivity();
        await _finalizeTurn();
      case AssistantLiveSocketGoAway(:final timeLeft):
        emit(
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
        final wsId = state.workspaceId;
        final scopeKey = state.scopeKey;
        if (wsId != null && scopeKey != null) {
          if (resumable && newHandle != null && newHandle.isNotEmpty) {
            await _repository.storeSessionHandle(
              wsId: wsId,
              scopeKey: scopeKey,
              sessionHandle: newHandle,
            );
            emit(state.copyWith(sessionHandle: newHandle));
          } else {
            await _repository.clearSessionHandle(
              wsId: wsId,
              scopeKey: scopeKey,
            );
            emit(state.copyWith(sessionHandle: null));
          }
        }
      case AssistantLiveSocketToolCall(:final calls):
        await _executeToolCalls(calls);
    }
  }

  Future<void> _executeToolCalls(List<AssistantLiveFunctionCall> calls) async {
    final wsId = state.workspaceId;
    if (wsId == null || calls.isEmpty) {
      return;
    }

    final functionResponses = <Map<String, dynamic>>[];
    final nextCards = [...state.insightCards];

    for (final call in calls) {
      _ensureActiveTurn();
      _currentToolCalls.add({
        'toolName': call.name,
        'toolCallId': call.id,
        'args': call.args,
      });

      try {
        final result = await _repository.executeToolCall(
          wsId: wsId,
          functionName: call.name,
          args: call.args,
        );
        _currentToolResults.add({
          'toolCallId': call.id,
          'toolName': call.name,
          'result': result,
        });
        functionResponses.add({
          'id': call.id,
          'name': call.name,
          'response': {
            'result': result,
          },
        });
        final card = _buildInsightCard(call, result);
        if (card != null) {
          nextCards.insert(0, card);
        }
      } on ApiException catch (error) {
        functionResponses.add({
          'id': call.id,
          'name': call.name,
          'response': {
            'result': {'error': error.message},
          },
        });
      } on Exception catch (error) {
        functionResponses.add({
          'id': call.id,
          'name': call.name,
          'response': {
            'result': {'error': error.toString()},
          },
        });
      }
    }

    emit(
      state.copyWith(insightCards: nextCards.take(4).toList(growable: false)),
    );
    _socket.sendToolResponses(functionResponses);
  }

  Future<void> _finalizeTurn() async {
    final wsId = state.workspaceId;
    final chatId = state.chatId;
    final model = state.model;
    if (wsId == null || chatId == null || model == null) {
      _clearDrafts();
      return;
    }

    final userContent = _resolvedUserContent();
    final assistantContent = _resolvedAssistantContent();
    final hasAssistantMetadata =
        _currentAssistantTranscript.isNotEmpty ||
        _currentToolCalls.isNotEmpty ||
        _currentToolResults.isNotEmpty;
    final hasUserMetadata =
        _currentUserTranscript.isNotEmpty || _currentTurnAttachments.isNotEmpty;

    if (userContent.isEmpty &&
        assistantContent.isEmpty &&
        !hasAssistantMetadata &&
        !hasUserMetadata) {
      _clearDrafts();
      return;
    }

    final turnId = _currentTurnId ?? _newTurnId();
    final messages = <Map<String, dynamic>>[];

    if (userContent.isNotEmpty || hasUserMetadata) {
      messages.add({
        'role': 'user',
        'content': userContent,
        'metadata': {
          'source': 'live',
          if (_currentTypedInput.isNotEmpty) 'inputText': _currentTypedInput,
          if (_currentUserTranscript.isNotEmpty)
            'inputTranscript': _currentUserTranscript,
          if (_currentTurnAttachments.isNotEmpty)
            'attachments': _currentTurnAttachments
                .map(_serializeAttachment)
                .toList(growable: false),
        },
      });
    }

    if (assistantContent.isNotEmpty || hasAssistantMetadata) {
      messages.add({
        'role': 'assistant',
        'content': assistantContent,
        'metadata': {
          'source': 'live',
          if (_currentAssistantTranscript.isNotEmpty)
            'outputTranscript': _currentAssistantTranscript,
          if (_currentToolCalls.isNotEmpty) 'toolCalls': _currentToolCalls,
          if (_currentToolResults.isNotEmpty)
            'toolResults': _currentToolResults,
        },
      });
    }

    emit(state.copyWith(isPersisting: true));

    try {
      await _repository.persistLiveTurn(
        wsId: wsId,
        chatId: chatId,
        turnId: turnId,
        model: model,
        messages: messages,
      );
      await _onHistoryUpdated(wsId, chatId);
      emit(
        state.copyWith(
          isPersisting: false,
          clearError: true,
        ),
      );
    } on ApiException catch (error) {
      _emitError(error.message, preserveDrafts: true);
    } on Exception catch (error) {
      _emitError(error.toString(), preserveDrafts: true);
    }

    _clearDrafts();
  }

  void _scheduleReconnect() {
    if (_manualDisconnect || _reconnectScheduled || state.workspaceId == null) {
      return;
    }

    _reconnectScheduled = true;
    final wsId = state.workspaceId!;
    final chatId = state.chatId;
    final model = state.model;

    unawaited(
      Future<void>.delayed(const Duration(milliseconds: 800), () async {
        try {
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

  Future<void> _stopInputs() async {
    await _recorder.stop();
    await _cameraService.stopStreaming();
    emit(
      state.copyWith(
        isMicrophoneActive: false,
        isCameraActive: false,
        audioLevel: 0,
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
      ),
    );
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
      isClosed || requestVersion != _requestVersion;

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

  String _newTurnId() => 'live-${DateTime.now().microsecondsSinceEpoch}';

  void _clearDrafts() {
    _currentTurnId = null;
    _currentTypedInput = '';
    _currentUserTranscript = '';
    _currentAssistantText = '';
    _currentAssistantTranscript = '';
    _currentTurnAttachments = const [];
    _currentToolCalls.clear();
    _currentToolResults.clear();

    if (isClosed) {
      return;
    }

    emit(
      state.copyWith(
        userDraft: '',
        userTranscript: '',
        assistantDraft: '',
        assistantTranscript: '',
        isInterrupted: false,
        isPersisting: false,
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
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
    if (!preserveDrafts) {
      _clearDrafts();
    }
  }

  @override
  Future<void> close() async {
    _manualDisconnect = true;
    _assistantSpeakingTimer?.cancel();
    await _socketSubscription?.cancel();
    await _stopInputs();
    await _socket.disconnect();
    await _audioPlayer.dispose();
    await _recorder.dispose();
    await _cameraService.dispose();
    _socket.dispose();
    return super.close();
  }

  void _markAssistantActivity({
    Uint8List? chunkBytes,
    bool textOnly = false,
  }) {
    if (isClosed) {
      return;
    }

    _assistantSpeakingTimer?.cancel();
    final level = textOnly
        ? 0.22
        : ((chunkBytes?.lengthInBytes ?? 0) / 12000).clamp(0.26, 1.0);
    emit(
      state.copyWith(
        assistantAudioLevel: level,
        isAssistantSpeaking: true,
      ),
    );
    _assistantSpeakingTimer = Timer(const Duration(milliseconds: 240), () {
      if (isClosed) {
        return;
      }
      emit(
        state.copyWith(
          assistantAudioLevel: 0,
          isAssistantSpeaking: false,
        ),
      );
    });
  }

  void _clearAssistantActivity() {
    _assistantSpeakingTimer?.cancel();
    _assistantSpeakingTimer = null;
    if (isClosed) {
      return;
    }
    emit(
      state.copyWith(
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
      ),
    );
  }
}
