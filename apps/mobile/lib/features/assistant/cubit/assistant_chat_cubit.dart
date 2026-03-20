// Assistant feature parity module: targeted lint suppressions keep the
// streaming/state port readable while the feature settles.
// ignore_for_file: always_use_package_imports, lines_longer_than_80_chars, avoid_positional_boolean_parameters, inference_failure_on_collection_literal, avoid_single_cascade_in_expression_statements, unnecessary_breaks

import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:file_picker/file_picker.dart';

import '../data/assistant_preferences.dart';
import '../data/assistant_repository.dart';
import '../data/assistant_stream_parser.dart';
import '../models/assistant_models.dart';

part 'assistant_chat_state.dart';

class AssistantChatCubit extends Cubit<AssistantChatState> {
  AssistantChatCubit({
    required AssistantRepository repository,
    required AssistantPreferences preferences,
    required Future<void> Function(String workspaceContextId)
    onWorkspaceContextChanged,
    required Future<void> Function() onSoulRefreshRequested,
    required void Function(bool isImmersive) onImmersiveModeChanged,
    required Future<void> Function(String? modelId) onChatRestored,
  }) : _repository = repository,
       _preferences = preferences,
       _onWorkspaceContextChanged = onWorkspaceContextChanged,
       _onSoulRefreshRequested = onSoulRefreshRequested,
       _onImmersiveModeChanged = onImmersiveModeChanged,
       _onChatRestored = onChatRestored,
       super(
         AssistantChatState(
           fallbackChatId: repository.generateUuid(),
         ),
       );

  final AssistantRepository _repository;
  final AssistantPreferences _preferences;
  final Future<void> Function(String workspaceContextId)
  _onWorkspaceContextChanged;
  final Future<void> Function() _onSoulRefreshRequested;
  final void Function(bool isImmersive) _onImmersiveModeChanged;
  final Future<void> Function(String? modelId) _onChatRestored;

  Timer? _queueDebounce;
  StreamSubscription<AssistantStreamEvent>? _streamSubscription;
  final List<AssistantQueuedSubmission> _queue = [];
  bool _flushAfterStop = false;
  int _workspaceVersion = 0;
  String? _activeAssistantMessageId;
  String? _activeTextBlockId;
  String? _activeReasoningBlockId;

  Future<void> loadWorkspace(String wsId) async {
    final workspaceVersion = ++_workspaceVersion;
    final preserveState = state.workspaceId == wsId && state.hasLoadedOnce;
    await _streamSubscription?.cancel();
    _queueDebounce?.cancel();
    _queue.clear();
    _flushAfterStop = false;
    _activeAssistantMessageId = null;
    _activeTextBlockId = null;
    _activeReasoningBlockId = null;

    if (preserveState) {
      emit(
        state.copyWith(
          workspaceId: wsId,
          fallbackChatId: _repository.generateUuid(),
          composerAttachments: const [],
          queuedPreview: null,
          status: AssistantChatStatus.restoring,
          clearError: true,
        ),
      );
    } else {
      emit(
        AssistantChatState(
          workspaceId: wsId,
          fallbackChatId: _repository.generateUuid(),
          status: AssistantChatStatus.restoring,
        ),
      );
    }

    try {
      final storedChatId = await _preferences.loadChatId(wsId);
      final history = await _repository.fetchRecentChats();

      if (storedChatId == null) {
        if (workspaceVersion != _workspaceVersion) return;
        emit(
          state.copyWith(
            status: AssistantChatStatus.idle,
            hasLoadedOnce: true,
            history: history,
            storedChatId: null,
          ),
        );
        await _onChatRestored(null);
        return;
      }

      final restored = await _repository.restoreChat(
        wsId: wsId,
        chatId: storedChatId,
      );
      if (workspaceVersion != _workspaceVersion) return;

      if (restored == null) {
        await _preferences.clearChatId(wsId);
        emit(
          state.copyWith(
            status: AssistantChatStatus.idle,
            hasLoadedOnce: true,
            chat: null,
            storedChatId: null,
            messages: const [],
            attachmentsByMessageId: const {},
            history: history,
          ),
        );
        await _onChatRestored(null);
        return;
      }

      emit(
        state.copyWith(
          status: AssistantChatStatus.idle,
          hasLoadedOnce: true,
          chat: restored.chat,
          storedChatId: restored.chat?.id,
          messages: restored.messages,
          attachmentsByMessageId: restored.attachmentsByMessageId,
          history: history,
        ),
      );
      await _onChatRestored(restored.chat?.model);
    } on Exception catch (error) {
      if (workspaceVersion != _workspaceVersion) return;
      emit(
        state.copyWith(
          status: AssistantChatStatus.error,
          error: error.toString(),
        ),
      );
    }
  }

  Future<void> openChat(String wsId, AssistantChatRecord chat) async {
    emit(
      state.copyWith(status: AssistantChatStatus.restoring, clearError: true),
    );
    final restored = await _repository.restoreChat(wsId: wsId, chatId: chat.id);
    if (restored == null) {
      emit(
        state.copyWith(
          status: AssistantChatStatus.error,
          error: 'Failed to load chat history.',
        ),
      );
      return;
    }

    await _preferences.saveChatId(wsId, chat.id);
    emit(
      state.copyWith(
        status: AssistantChatStatus.idle,
        chat: restored.chat,
        storedChatId: chat.id,
        messages: restored.messages,
        attachmentsByMessageId: restored.attachmentsByMessageId,
      ),
    );
    await _onChatRestored(restored.chat?.model);
  }

  Future<void> refreshHistory() async {
    final history = await _repository.fetchRecentChats();
    emit(state.copyWith(history: history));
  }

  Future<void> addComposerAttachments({
    required String wsId,
    required List<PlatformFile> files,
  }) async {
    for (final file in files) {
      final id = _repository.generateUuid();
      final picked = AssistantFilePickerResult.fromPlatformFile(file, id);
      final pendingAttachment = AssistantAttachment(
        id: id,
        name: picked.name,
        size: picked.size,
        type: picked.mimeType,
        localPath: picked.path,
        uploadState: AssistantAttachmentUploadState.uploading,
      );

      emit(
        state.copyWith(
          composerAttachments: [
            ...state.composerAttachments,
            pendingAttachment,
          ],
        ),
      );

      try {
        final uploaded = await _repository.uploadAttachment(
          wsId: wsId,
          chatId: state.chat?.id,
          file: picked,
        );
        emit(
          state.copyWith(
            composerAttachments: state.composerAttachments
                .map(
                  (attachment) => attachment.id == id ? uploaded : attachment,
                )
                .toList(),
          ),
        );
      } on Exception {
        emit(
          state.copyWith(
            composerAttachments: state.composerAttachments
                .map(
                  (attachment) => attachment.id == id
                      ? attachment.copyWith(
                          uploadState: AssistantAttachmentUploadState.error,
                        )
                      : attachment,
                )
                .toList(),
          ),
        );
      }
    }
  }

  Future<void> removeComposerAttachment({
    required String wsId,
    required String attachmentId,
  }) async {
    AssistantAttachment? target;
    for (final attachment in state.composerAttachments) {
      if (attachment.id == attachmentId) {
        target = attachment;
        break;
      }
    }

    emit(
      state.copyWith(
        composerAttachments: state.composerAttachments
            .where((attachment) => attachment.id != attachmentId)
            .toList(),
      ),
    );

    if (target?.storagePath case final storagePath?) {
      unawaited(_repository.deleteAttachment(wsId: wsId, path: storagePath));
    }
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
  }) async {
    final trimmed = message.trim();
    final uploadedAttachments = state.composerAttachments
        .where((attachment) => attachment.isUploaded)
        .toList();
    if (trimmed.isEmpty && uploadedAttachments.isEmpty) {
      return;
    }

    final queueMessage = trimmed.isEmpty
        ? 'Please analyze the attached file(s).'
        : trimmed;
    final queued = AssistantQueuedSubmission(
      message: queueMessage,
      attachments: uploadedAttachments,
    );

    final isDuplicate = _queue.any((item) => item.message == queued.message);
    if (!isDuplicate || uploadedAttachments.isNotEmpty) {
      _queue.add(queued);
    }

    emit(
      state.copyWith(
        queuedPreview: _queue.map((item) => item.message).join('\n\n'),
      ),
    );

    if (state.isBusy) {
      _flushAfterStop = true;
      await stopStreaming();
      return;
    }

    _queueDebounce?.cancel();
    _queueDebounce = Timer(const Duration(milliseconds: 500), () {
      unawaited(
        _flushQueue(
          wsId: wsId,
          modelId: modelId,
          thinkingMode: thinkingMode,
          creditSource: creditSource,
          workspaceContextId: workspaceContextId,
          timezone: timezone,
          creditWsId: creditWsId,
        ),
      );
    });
  }

  Future<void> stopStreaming() async {
    _queueDebounce?.cancel();
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
  }) async {
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

    await submit(
      wsId: wsId,
      message: text,
      modelId: modelId,
      thinkingMode: thinkingMode,
      creditSource: creditSource,
      workspaceContextId: workspaceContextId,
      timezone: timezone,
      creditWsId: creditWsId,
    );
  }

  Future<void> resetConversation(String wsId) async {
    await stopStreaming();
    _queue.clear();
    _flushAfterStop = false;
    await _preferences.clearChatId(wsId);
    await _preferences.saveWorkspaceContextId(wsId, 'personal');
    emit(
      state.copyWith(
        status: AssistantChatStatus.idle,
        chat: null,
        storedChatId: null,
        messages: const [],
        attachmentsByMessageId: const {},
        composerAttachments: const [],
        fallbackChatId: _repository.generateUuid(),
        queuedPreview: null,
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

  Future<void> _flushQueue({
    required String wsId,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
  }) async {
    if (_queue.isEmpty) return;

    final unique = <String>[];
    for (final item in _queue) {
      if (!unique.contains(item.message)) {
        unique.add(item.message);
      }
    }
    final attachments = _queue.expand((item) => item.attachments).toList();
    _queue..clear();
    _flushAfterStop = false;

    final combined = unique.join('\n\n');
    var chat = state.chat;
    var chatId = chat?.id ?? state.fallbackChatId;

    emit(
      state.copyWith(
        status: AssistantChatStatus.submitting,
        queuedPreview: null,
        clearError: true,
      ),
    );

    if (chat == null) {
      final created = await _repository.createChat(
        id: chatId,
        modelId: modelId,
        message: combined,
        timezone: timezone,
      );
      chat = created;
      chatId = created.id;
      await _preferences.saveChatId(wsId, chatId);
      emit(state.copyWith(chat: created, storedChatId: chatId));
      await refreshHistory();
    }

    final userMessage = AssistantMessage(
      id: _repository.generateUuid(),
      role: 'user',
      parts: [AssistantMessagePart(type: 'text', text: combined)],
      createdAt: DateTime.now(),
    );

    final attachmentsByMessageId = Map<String, List<AssistantAttachment>>.from(
      state.attachmentsByMessageId,
    );
    if (attachments.isNotEmpty) {
      attachmentsByMessageId[userMessage.id] = attachments;
    }

    final nextMessages = [...state.messages, userMessage];
    emit(
      state.copyWith(
        messages: nextMessages,
        attachmentsByMessageId: attachmentsByMessageId,
        composerAttachments: const [],
      ),
    );

    _activeAssistantMessageId = null;
    _activeTextBlockId = null;
    _activeReasoningBlockId = null;

    _streamSubscription = _repository
        .streamChat(
          chatId: chatId,
          wsId: wsId,
          workspaceContextId: workspaceContextId,
          modelId: modelId,
          messages: nextMessages,
          thinkingMode: thinkingMode,
          creditSource: creditSource,
          timezone: timezone,
          creditWsId: creditWsId,
        )
        .listen(
          _handleStreamEvent,
          onError: (Object error, StackTrace stackTrace) {
            emit(
              state.copyWith(
                status: AssistantChatStatus.error,
                error: error.toString(),
              ),
            );
          },
          onDone: () async {
            _streamSubscription = null;
            emit(state.copyWith(status: AssistantChatStatus.idle));
            if (_flushAfterStop) {
              await _flushQueue(
                wsId: wsId,
                modelId: modelId,
                thinkingMode: thinkingMode,
                creditSource: creditSource,
                workspaceContextId: workspaceContextId,
                timezone: timezone,
                creditWsId: creditWsId,
              );
            }
          },
          cancelOnError: false,
        );
  }

  void _handleStreamEvent(AssistantStreamEvent event) {
    if (event is AssistantDoneStreamEvent) {
      emit(state.copyWith(status: AssistantChatStatus.idle));
      return;
    }
    if (event is! AssistantJsonStreamEvent) return;

    final payload = event.payload;
    final type = payload['type'] as String? ?? '';

    switch (type) {
      case 'start':
        _activeAssistantMessageId = payload['messageId'] as String?;
        if (_activeAssistantMessageId == null) return;
        _ensureAssistantMessage(_activeAssistantMessageId!);
        emit(state.copyWith(status: AssistantChatStatus.streaming));
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
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: payload['toolName'] as String?,
          toolState: 'output-available',
          output: payload['output'],
        );
        unawaited(_handleToolSideEffect(payload));
        break;
      case 'start-step':
        _appendPart(const AssistantMessagePart(type: 'step-start'));
        break;
      case 'error':
        emit(
          state.copyWith(
            status: AssistantChatStatus.error,
            error:
                payload['errorText'] as String? ?? 'Assistant stream failed.',
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

  Future<void> _handleToolSideEffect(Map<String, dynamic> payload) async {
    final toolName = payload['toolName'] as String?;
    final output = payload['output'];

    if (toolName == 'set_workspace_context') {
      final contextId = _readWorkspaceContextId(output);
      if (contextId != null && contextId.isNotEmpty) {
        await _onWorkspaceContextChanged(contextId);
      }
    }

    if (toolName == 'update_my_settings') {
      await _onSoulRefreshRequested();
    }

    if (toolName == 'set_immersive_mode') {
      final isImmersive = _readImmersiveFlag(output);
      _onImmersiveModeChanged(isImmersive);
    }
  }

  String? _readWorkspaceContextId(dynamic value) {
    if (value is Map<String, dynamic>) {
      for (final key in const [
        'workspaceContextId',
        'workspace_context_id',
        'wsId',
        'workspaceId',
      ]) {
        final candidate = value[key];
        if (candidate is String && candidate.isNotEmpty) {
          return candidate;
        }
      }
    }
    return null;
  }

  bool _readImmersiveFlag(dynamic value) {
    if (value is Map<String, dynamic>) {
      for (final key in const [
        'immersiveMode',
        'immersive',
        'enabled',
        'value',
      ]) {
        final candidate = value[key];
        if (candidate is bool) {
          return candidate;
        }
      }
    }
    return false;
  }

  void _ensureAssistantMessage(String messageId) {
    final existing = state.messages.any((message) => message.id == messageId);
    if (existing) return;
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

  @override
  Future<void> close() async {
    _queueDebounce?.cancel();
    await _streamSubscription?.cancel();
    return super.close();
  }
}
