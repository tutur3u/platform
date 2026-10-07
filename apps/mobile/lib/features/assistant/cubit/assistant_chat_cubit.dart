// Relative imports preserve the existing Assistant module layout.
// ignore_for_file: always_use_package_imports, lines_longer_than_80_chars, avoid_positional_boolean_parameters, inference_failure_on_collection_literal, unnecessary_breaks

import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/core/observability/mobile_observability.dart';
import 'package:mobile/core/observability/operational_error_reporter.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';

import '../data/assistant_preferences.dart';
import '../data/assistant_repository.dart';
import '../data/assistant_stream_parser.dart';
import '../models/assistant_models.dart';
import 'assistant_tool_output.dart';

part 'assistant_chat_attachments.dart';
part 'assistant_chat_restore.dart';
part 'assistant_chat_state.dart';
part 'assistant_chat_stream_reconcile.dart';
part 'assistant_chat_submission.dart';
part 'assistant_chat_tool_effects.dart';

class AssistantChatCubit extends Cubit<AssistantChatState> {
  AssistantChatCubit({
    required AssistantRepository repository,
    required AssistantPreferences preferences,
    required Future<void> Function(String workspaceContextId)
    onWorkspaceContextChanged,
    required Future<void> Function() onSoulRefreshRequested,
    required void Function(bool isImmersive) onImmersiveModeChanged,
    required Future<void> Function(String? modelId) onChatRestored,
    void Function(SafeErrorDiagnostics diagnostics)? onSoulRefreshFailed,
    OperationalErrorReporter? operationalReporter,
  }) : _operationalReporter =
           operationalReporter ??
           MobileObservability.instance.operationalReporter,
       _repository = repository,
       _preferences = preferences,
       _onWorkspaceContextChanged = onWorkspaceContextChanged,
       _onSoulRefreshRequested = onSoulRefreshRequested,
       _onSoulRefreshFailed = onSoulRefreshFailed,
       _onImmersiveModeChanged = onImmersiveModeChanged,
       _onChatRestored = onChatRestored,
       super(AssistantChatState(fallbackChatId: repository.generateUuid()));

  final OperationalErrorReporter _operationalReporter;
  final AssistantRepository _repository;
  final AssistantPreferences _preferences;
  final Future<void> Function(String workspaceContextId)
  _onWorkspaceContextChanged;
  final Future<void> Function() _onSoulRefreshRequested;
  final void Function(SafeErrorDiagnostics diagnostics)? _onSoulRefreshFailed;
  final void Function(bool isImmersive) _onImmersiveModeChanged;
  final Future<void> Function(String? modelId) _onChatRestored;

  Timer? _queueDebounce;
  StreamSubscription<AssistantStreamEvent>? _streamSubscription;
  final List<AssistantQueuedSubmission> _queue = [];
  int _workspaceVersion = 0;
  int _historyVersion = 0;
  int _toolOperationVersion = 0;
  String? _activeAssistantMessageId;
  String? _activeTextBlockId;
  String? _activeReasoningBlockId;
  Future<String>? _pendingAttachmentChatId;
  String? _pendingAttachmentWorkspaceId;
  int? _pendingAttachmentWorkspaceVersion;

  void _emitIfOpen(AssistantChatState nextState) {
    if (isClosed) {
      return;
    }
    emit(nextState);
  }

  Future<void> loadWorkspace(String wsId) => _loadWorkspace(wsId);

  Future<void> openChat(String wsId, AssistantChatRecord chat) =>
      _openChat(wsId, chat);

  Future<void> openChatById(String wsId, String chatId) =>
      _openChatById(wsId, chatId, forceRefresh: true);

  Future<void> refreshHistory() => _refreshHistory();

  List<AssistantAttachment> takeUploadedComposerAttachments() {
    final uploaded = state.composerAttachments
        .where((attachment) => attachment.isUploaded)
        .toList(growable: false);
    if (uploaded.isEmpty) {
      return const [];
    }

    emit(
      state.copyWith(
        composerAttachments: state.composerAttachments
            .where((attachment) => !attachment.isUploaded)
            .toList(growable: false),
      ),
    );
    return uploaded;
  }

  Future<void> submit({
    required String wsId,
    required String message,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    String? retryMessageId,
    bool Function()? isCurrent,
  }) => _submit(
    wsId: wsId,
    message: message,
    modelId: modelId,
    thinkingMode: thinkingMode,
    creditSource: creditSource,
    workspaceContextId: workspaceContextId,
    timezone: timezone,
    creditWsId: creditWsId,
    retryMessageId: retryMessageId,
    isCurrent: isCurrent,
  );

  Future<void> stopStreaming({bool discardQueued = false}) async {
    _toolOperationVersion++;
    _queueDebounce?.cancel();
    if (discardQueued) {
      _queue.clear();
      _emitIfOpen(state.copyWith(queuedMessages: const []));
    }
    await _streamSubscription?.cancel();
    _streamSubscription = null;
    emit(state.copyWith(status: AssistantChatStatus.idle));
  }

  Future<void> retryLast({
    required String wsId,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    bool Function()? isCurrent,
  }) async {
    if (isCurrent != null && !isCurrent()) return;
    final lastUserMessage = state.messages.lastWhere(
      (message) => message.role == 'user',
      orElse: () => const AssistantMessage(id: '', role: 'user'),
    );
    if (lastUserMessage.id.isEmpty) return;
    final text = lastUserMessage.parts
        .where((part) => part.type == 'text')
        .map((part) => part.text ?? '')
        .join('\n');
    if (text.trim().isEmpty) return;

    final retryIndex = state.messages.lastIndexWhere(
      (message) => message.id == lastUserMessage.id,
    );
    if (retryIndex < 0) return;
    emit(
      state.copyWith(
        messages: state.messages.take(retryIndex + 1).toList(growable: false),
        clearError: true,
      ),
    );

    await submit(
      wsId: wsId,
      message: text,
      modelId: modelId,
      thinkingMode: thinkingMode,
      creditSource: creditSource,
      workspaceContextId: workspaceContextId,
      timezone: timezone,
      creditWsId: creditWsId,
      retryMessageId: lastUserMessage.id,
      isCurrent: isCurrent,
    );
  }

  Future<void> resetConversation(String wsId) async {
    final version = ++_workspaceVersion;
    await stopStreaming();
    if (isClosed || version != _workspaceVersion) return;
    _queue.clear();
    await _preferences.clearChatId(
      wsId,
      shouldWrite: () => !isClosed && version == _workspaceVersion,
    );
    await _preferences.saveWorkspaceContextId(
      wsId,
      'personal',
      shouldWrite: () => !isClosed && version == _workspaceVersion,
    );
    if (isClosed || version != _workspaceVersion) return;
    emit(
      state.copyWith(
        status: AssistantChatStatus.idle,
        chat: null,
        storedChatId: null,
        messages: const [],
        attachmentsByMessageId: const {},
        composerAttachments: const [],
        fallbackChatId: _repository.generateUuid(),
        queuedMessages: const [],
      ),
    );
    await _onWorkspaceContextChanged('personal');
    await _onChatRestored(null);
  }

  Map<String, dynamic> buildExportPayload({
    required String wsId,
    required AssistantGatewayModel model,
    required AssistantThinkingMode thinkingMode,
  }) {
    final chatId = state.chat?.id ?? state.fallbackChatId;
    return {
      'exportedAt': DateTime.now().toIso8601String(),
      'wsId': wsId,
      'chatId': chatId,
      'fallbackChatId': state.fallbackChatId,
      'status': state.status.name,
      'model': model.toJson(),
      'thinkingMode': thinkingMode.name,
      'chat': state.chat?.toJson(),
      'messages': state.messages.map((message) => message.toJson()).toList(),
      'messageAttachments': state.attachmentsByMessageId.map(
        (key, value) => MapEntry(
          key,
          value.map((attachment) => attachment.toJson()).toList(),
        ),
      ),
    };
  }

  bool _shouldPrimeConversationUi(List<AssistantAttachment> attachments) {
    return state.chat == null &&
        state.storedChatId == null &&
        state.messages.isEmpty &&
        !state.isBusy &&
        (attachments.isNotEmpty || _queue.isNotEmpty);
  }

  void _handleStreamEvent(
    AssistantStreamEvent event, {
    required bool Function() isCurrent,
    required Set<String> handledToolEffects,
  }) {
    if (isClosed || state.status == AssistantChatStatus.error) return;
    if (event is AssistantDoneStreamEvent) {
      emit(state.copyWith(status: AssistantChatStatus.idle));
      _persistAssistantChatCache();
      return;
    }
    if (event is! AssistantJsonStreamEvent) return;

    final payload = event.payload;
    final type = payload['type'] as String? ?? '';

    switch (type) {
      case 'start':
        _activeAssistantMessageId =
            payload['messageId'] as String? ?? _repository.generateUuid();
        _activeTextBlockId = null;
        _activeReasoningBlockId = null;
        emit(state.copyWith(status: AssistantChatStatus.streaming));
        break;
      case 'saved-message':
        _reconcileSavedMessage(payload);
        break;
      case 'text-start':
        _activeTextBlockId = payload['id'] as String?;
        emit(state.copyWith(status: AssistantChatStatus.streaming));
        break;
      case 'text-delta':
        _appendTextPart(
          blockId: payload['id'] as String?,
          delta: payload['delta'] as String? ?? '',
        );
        break;
      case 'reasoning-start':
        _activeReasoningBlockId = payload['id'] as String?;
        emit(state.copyWith(status: AssistantChatStatus.streaming));
        break;
      case 'reasoning-delta':
        _appendReasoningPart(
          blockId: payload['id'] as String?,
          delta: payload['delta'] as String? ?? '',
        );
        break;
      case 'source-url':
        _appendPart(
          AssistantMessagePart(
            type: 'source-url',
            sourceId: payload['sourceId'] as String?,
            url: payload['url'] as String?,
            title: payload['title'] as String?,
          ),
        );
        break;
      case 'tool-input-start':
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: payload['toolName'] as String?,
          toolState: 'input-streaming',
          input: const {},
        );
        break;
      case 'tool-input-delta':
        _appendToolInputText(
          toolCallId: payload['toolCallId'] as String?,
          delta: payload['inputTextDelta'] as String? ?? '',
        );
        break;
      case 'tool-input-available':
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: payload['toolName'] as String?,
          toolState: 'input-available',
          input: payload['input'],
        );
        break;
      case 'tool-output-available':
        final retainedName = _currentInputToolName(payload['toolCallId']);
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: retainedName ?? payload['toolName'] as String?,
          toolState: 'output-available',
          output: payload['output'],
        );
        unawaited(
          _handleToolSideEffect(
            payload,
            retainedName: retainedName,
            isCurrent: isCurrent,
            handled: handledToolEffects,
          ),
        );
        break;
      case 'start-step':
        _appendPart(const AssistantMessagePart(type: 'step-start'));
        break;
      case 'error':
        emit(
          state.copyWith(
            messages: _withoutEmptyAssistantReply(
              state.messages,
              _activeAssistantMessageId,
            ),
            status: AssistantChatStatus.error,
            error:
                payload['errorText'] as String? ?? 'Assistant stream failed.',
            diagnostics: const SafeErrorDiagnostics.streamFailure(),
          ),
        );
        break;
      case 'finish':
      case 'finish-step':
      case 'text-end':
      case 'reasoning-end':
      case 'abort':
        emit(state.copyWith(status: AssistantChatStatus.streaming));
        break;
      default:
        break;
    }
  }

  void _reconcileSavedMessage(Map<String, dynamic> payload) {
    final savedId = payload['messageId'] as String?;
    if (savedId == null || savedId.isEmpty) return;
    final result = _reconcileSavedAssistantMessage(
      state.messages,
      streamedId: _activeAssistantMessageId,
      savedId: savedId,
      savedText: payload['text'] as String? ?? '',
    );
    _activeAssistantMessageId = savedId;
    emit(state.copyWith(messages: result));
  }

  void _ensureAssistantMessage(String messageId) {
    if (state.messages.any((message) => message.id == messageId)) return;
    emit(
      state.copyWith(
        messages: [
          ...state.messages,
          AssistantMessage(
            id: messageId,
            role: 'assistant',
            createdAt: DateTime.now(),
          ),
        ],
      ),
    );
  }

  void _appendTextPart({required String? blockId, required String delta}) {
    if ((_activeAssistantMessageId ?? '').isEmpty || delta.isEmpty) return;
    _ensureAssistantMessage(_activeAssistantMessageId!);

    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;

      final parts = List<AssistantMessagePart>.from(message.parts);
      final index = parts.lastIndexWhere(
        (part) =>
            part.type == 'text' &&
            part.blockId == (blockId ?? _activeTextBlockId),
      );

      if (index == -1) {
        parts.add(
          AssistantMessagePart(
            type: 'text',
            text: delta,
            blockId: blockId ?? _activeTextBlockId,
          ),
        );
      } else {
        final existing = parts[index];
        parts[index] = existing.copyWith(text: '${existing.text ?? ''}$delta');
      }
      return message.copyWith(parts: parts);
    }).toList();

    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _appendReasoningPart({required String? blockId, required String delta}) {
    if ((_activeAssistantMessageId ?? '').isEmpty || delta.isEmpty) return;
    _ensureAssistantMessage(_activeAssistantMessageId!);

    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;

      final parts = List<AssistantMessagePart>.from(message.parts);
      final index = parts.lastIndexWhere(
        (part) =>
            part.type == 'reasoning' &&
            part.blockId == (blockId ?? _activeReasoningBlockId),
      );

      if (index == -1) {
        parts.add(
          AssistantMessagePart(
            type: 'reasoning',
            text: delta,
            blockId: blockId ?? _activeReasoningBlockId,
          ),
        );
      } else {
        final existing = parts[index];
        parts[index] = existing.copyWith(text: '${existing.text ?? ''}$delta');
      }
      return message.copyWith(parts: parts);
    }).toList();

    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _appendPart(AssistantMessagePart part) {
    if ((_activeAssistantMessageId ?? '').isEmpty) return;
    _ensureAssistantMessage(_activeAssistantMessageId!);
    final updated = state.messages.map((message) {
      if (message.id != _activeAssistantMessageId) return message;
      return message.copyWith(parts: [...message.parts, part]);
    }).toList();
    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _upsertToolPart({
    required String? toolCallId,
    required String? toolName,
    String? toolState,
    dynamic input,
    dynamic output,
  }) {
    if ((_activeAssistantMessageId ?? '').isEmpty) return;
    _ensureAssistantMessage(_activeAssistantMessageId!);

    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;

      final parts = List<AssistantMessagePart>.from(message.parts);
      final index = parts.lastIndexWhere(
        (part) => part.type == 'dynamic-tool' && part.toolCallId == toolCallId,
      );

      final nextPart = AssistantMessagePart(
        type: 'dynamic-tool',
        toolCallId: toolCallId,
        toolName: toolName,
        state: toolState,
        input: input,
        output: output,
      );

      if (index == -1) {
        parts.add(nextPart);
      } else {
        parts[index] = parts[index].copyWith(
          toolName: toolName ?? parts[index].toolName,
          state: toolState ?? parts[index].state,
          input: input ?? parts[index].input,
          output: output ?? parts[index].output,
        );
      }

      return message.copyWith(parts: parts);
    }).toList();

    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _appendToolInputText({
    required String? toolCallId,
    required String delta,
  }) {
    if ((_activeAssistantMessageId ?? '').isEmpty || delta.isEmpty) return;
    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;
      final parts = List<AssistantMessagePart>.from(message.parts);
      final index = parts.lastIndexWhere(
        (part) => part.type == 'dynamic-tool' && part.toolCallId == toolCallId,
      );
      if (index == -1) {
        parts.add(
          AssistantMessagePart(
            type: 'dynamic-tool',
            toolCallId: toolCallId,
            state: 'input-streaming',
            input: {'inputText': delta},
          ),
        );
      } else {
        final existingInput = parts[index].input;
        final previousText = existingInput is Map<String, dynamic>
            ? existingInput['inputText'] as String? ?? ''
            : '';
        parts[index] = parts[index].copyWith(
          input: {'inputText': '$previousText$delta'},
          state: 'input-streaming',
        );
      }
      return message.copyWith(parts: parts);
    }).toList();

    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _persistAssistantChatCache() {
    final wsId = state.workspaceId;
    final chatId = state.chat?.id ?? state.storedChatId;
    if (wsId == null || chatId == null) {
      return;
    }
    if (state.messages.isEmpty && state.chat == null) {
      return;
    }
    unawaited(
      _repository.writeAssistantChatCache(
        wsId: wsId,
        chatId: chatId,
        restored: AssistantRestoredChat(
          chat: state.chat,
          messages: state.messages,
          attachmentsByMessageId: state.attachmentsByMessageId,
        ),
      ),
    );
  }

  void _finalizeToolParts() {
    if ((_activeAssistantMessageId ?? '').isEmpty) return;

    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;

      final parts = message.parts.map((part) {
        if (part.type != 'dynamic-tool') return part;

        // Mark any streaming tool as completed
        final isStreaming =
            part.state == 'input-streaming' ||
            part.state == 'input-start' ||
            part.state == 'output-streaming' ||
            part.state == 'output-start';

        if (isStreaming) {
          return part.copyWith(state: 'completed');
        }
        return part;
      }).toList();

      return message.copyWith(parts: parts);
    }).toList();

    emit(state.copyWith(messages: updated));
  }

  @override
  Future<void> close() async {
    _queueDebounce?.cancel();
    await _streamSubscription?.cancel();
    return await super.close();
  }
}
