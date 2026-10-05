import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_litert_runtime.dart';
import 'package:mobile/features/assistant/local/assistant_local_capability.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_state.dart';
import 'package:mobile/features/assistant/local/assistant_local_history.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_model_store.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

/// Native text-only lane: no remote repository, credits, tools or attachments.
class AssistantLocalChatCubit extends Cubit<AssistantLocalChatState> {
  AssistantLocalChatCubit({
    required Object? Function() currentScope,
    AssistantLocalRuntime? runtime,
    AssistantLocalModelStore? store,
    AssistantLocalHistory? history,
    AssistantLocalPreferences? preferences,
    Future<bool> Function()? supported,
  }) : _currentScope = currentScope,
       _runtime =
           runtime ??
           AssistantLocalRuntime(
             load: loadAssistantLiteRtModel,
             currentScope: currentScope,
           ),
       _store = store ?? AssistantLocalModelStore(),
       _history = history ?? AssistantLocalHistory(),
       _preferences = preferences ?? AssistantLocalPreferences(),
       _supported = supported ?? supportsAssistantLocalInference,
       super(const AssistantLocalChatState());

  final Object? Function() _currentScope;
  final AssistantLocalRuntime _runtime;
  final AssistantLocalModelStore _store;
  final AssistantLocalHistory _history;
  final AssistantLocalPreferences _preferences;
  final Future<bool> Function() _supported;
  Object? _scope;
  late String _actor;
  late String _workspace;
  int _version = 0;
  int _messageSequence = 0;
  late Future<void> _transition = Future<void>.value();
  bool get scopeCurrent => _current;
  int get scopeVersion => _version;
  bool get _current => !isClosed && _scope != null && _scope == _currentScope();

  Future<void> syncWorkspace(String actor, String workspace) async {
    final version = ++_version;
    _scope = _currentScope();
    _actor = actor;
    _workspace = workspace;
    emit(const AssistantLocalChatState(phase: LocalChatPhase.loading));
    await _enqueue(() async {
      if (!_current || version != _version) return;
      final selected = await _preferences.load(
        workspace,
        isScopeCurrent: () => _current && version == _version,
      );
      if (!_current || version != _version) return;
      await _activate(selected, version, persist: false);
    }, version);
  }

  Future<void> select(String? modelId) async {
    if (!_current) return;
    if (modelId != null &&
        !assistantLocalModels.any((model) => model.id == modelId)) {
      return;
    }
    final version = ++_version;
    emit(
      AssistantLocalChatState(
        selectedModelId: modelId ?? state.selectedModelId,
        phase: LocalChatPhase.loading,
        chat: state.chat,
      ),
    );
    await _enqueue(() => _activate(modelId, version, persist: true), version);
  }

  Future<void> _enqueue(Future<void> Function() action, int version) {
    final next = _transition.then((_) => action());
    return _transition = next.onError((_, _) {
      if (_current && version == _version) _fail(LocalChatFailure.storage);
    });
  }

  Future<void> _activate(
    String? modelId,
    int version, {
    required bool persist,
  }) async {
    bool current() => _current && version == _version;
    try {
      await _runtime.unload();
      if (!current()) return;
      if (persist) {
        await _preferences.save(_workspace, modelId, isScopeCurrent: current);
      }
      if (!current()) return;
      if (modelId == null) {
        emit(const AssistantLocalChatState());
        return;
      }
      emit(
        AssistantLocalChatState(
          selectedModelId: modelId,
          phase: LocalChatPhase.loading,
        ),
      );
      final matching = assistantLocalModels.where(
        (model) => model.id == modelId,
      );
      if (matching.isEmpty) {
        _fail(LocalChatFailure.missingModel);
        return;
      }
      final model = matching.single;
      final messages = await _history.load(
        actor: _actor,
        workspace: _workspace,
        model: modelId,
        isScopeCurrent: current,
      );
      if (!current()) return;
      emit(
        AssistantLocalChatState(
          selectedModelId: modelId,
          phase: LocalChatPhase.loading,
          chat: AssistantChatState(
            workspaceId: _workspace,
            fallbackChatId: 'local:$modelId',
            messages: messages,
          ),
        ),
      );
      if (!await _supported()) {
        if (current()) _fail(LocalChatFailure.unsupported);
        return;
      }
      final file = await _store.verifiedFile(model);
      if (!current()) return;
      if (file == null) {
        _fail(LocalChatFailure.missingModel);
        return;
      }
      await _runtime.load(file.path);
      if (current()) {
        emit(
          AssistantLocalChatState(
            selectedModelId: modelId,
            ready: _runtime.ready,
            chat: state.chat,
          ),
        );
      }
    } on Object {
      if (current()) _fail(LocalChatFailure.engine);
    }
  }

  void _fail(LocalChatFailure failure) => emit(
    AssistantLocalChatState(
      selectedModelId: state.selectedModelId,
      ready: failure != LocalChatFailure.engine && _runtime.ready,
      failure: failure,
      chat: state.chat.copyWith(status: AssistantChatStatus.idle),
    ),
  );

  String _messageId() {
    final timestamp = DateTime.now().microsecondsSinceEpoch;
    return 'local:$timestamp:${_messageSequence++}';
  }

  Future<void> send(String text) async {
    if (!_current ||
        !state.local ||
        !state.ready ||
        state.phase != LocalChatPhase.idle) {
      return;
    }
    final prompt = text.trim();
    if (prompt.isEmpty) return;
    if (prompt.length > 6000) {
      _fail(LocalChatFailure.input);
      return;
    }
    final version = ++_version;
    bool current() => _current && version == _version;
    final user = AssistantMessage(
      id: _messageId(),
      role: 'user',
      createdAt: DateTime.now(),
      parts: [AssistantMessagePart(type: 'text', text: prompt)],
    );
    final assistant = AssistantMessage(
      id: _messageId(),
      role: 'assistant',
      createdAt: DateTime.now(),
    );
    final history = [...state.chat.messages, user];
    final output = StringBuffer();
    emit(
      AssistantLocalChatState(
        selectedModelId: state.selectedModelId,
        ready: true,
        phase: LocalChatPhase.generating,
        chat: state.chat.copyWith(
          messages: [...history, assistant],
          status: AssistantChatStatus.streaming,
        ),
      ),
    );
    LocalChatFailure? failure;
    try {
      await for (final token in _runtime.generate(
        history
            .map(
              (message) => LocalChatTurn(
                text: message.parts
                    .where((part) => part.type == 'text')
                    .map((part) => part.text ?? '')
                    .join('\n'),
                isUser: message.role == 'user',
              ),
            )
            .toList(growable: false),
      )) {
        if (!current()) return;
        output.write(token);
        final reply = AssistantMessage(
          id: assistant.id,
          role: 'assistant',
          createdAt: assistant.createdAt,
          parts: [AssistantMessagePart(type: 'text', text: output.toString())],
        );
        emit(
          AssistantLocalChatState(
            selectedModelId: state.selectedModelId,
            ready: true,
            phase: LocalChatPhase.generating,
            chat: state.chat.copyWith(messages: [...history, reply]),
          ),
        );
      }
    } on Object {
      failure = LocalChatFailure.engine;
    }
    if (!current()) return;
    try {
      await _history.save(
        actor: _actor,
        workspace: _workspace,
        model: state.selectedModelId!,
        messages: state.chat.messages,
        isScopeCurrent: current,
      );
    } on Object {
      failure ??= LocalChatFailure.storage;
    }
    if (current()) {
      emit(
        AssistantLocalChatState(
          selectedModelId: state.selectedModelId,
          ready: failure != LocalChatFailure.engine && _runtime.ready,
          failure: failure,
          chat: state.chat.copyWith(
            status: failure == LocalChatFailure.engine
                ? AssistantChatStatus.error
                : AssistantChatStatus.idle,
          ),
        ),
      );
    }
  }

  Future<void> stop() async {
    try {
      await _runtime.stopAndDrain();
    } on Object {
      ++_version;
      try {
        await _runtime.unload();
      } on Object {
        // Native model close is attempted by unload even after a stop failure.
      }
      if (_current) _fail(LocalChatFailure.engine);
    }
  }

  Future<void> clearConversation() async {
    if (!_current || !state.local) return;
    final version = ++_version;
    bool current() => _current && version == _version;
    await stop();
    if (!current()) return;
    try {
      await _history.clear(
        actor: _actor,
        workspace: _workspace,
        model: state.selectedModelId!,
        isScopeCurrent: current,
      );
      if (current()) {
        emit(
          AssistantLocalChatState(
            selectedModelId: state.selectedModelId,
            ready: _runtime.ready,
            chat: AssistantChatState(
              workspaceId: _workspace,
              fallbackChatId: state.chat.fallbackChatId,
            ),
          ),
        );
      }
    } on Object {
      if (current()) _fail(LocalChatFailure.storage);
    }
  }

  Future<void> invalidate() async {
    ++_version;
    _scope = null;
    if (!isClosed) {
      emit(const AssistantLocalChatState(phase: LocalChatPhase.loading));
    }
    final version = _version;
    await _enqueue(_runtime.unload, version);
  }

  @override
  Future<void> close() async {
    ++_version;
    _scope = null;
    try {
      await _transition;
      await _runtime.close();
    } finally {
      await super.close();
    }
  }
}
