import 'dart:async';

class LocalChatTurn {
  const LocalChatTurn({required this.text, required this.isUser});
  final String text;
  final bool isUser;
}

abstract interface class LocalInferenceSession {
  Future<void> add(LocalChatTurn turn);
  Stream<String> generate();
  Future<void> stop();
  Future<void> close();
}

abstract interface class LocalInferenceModel {
  Future<LocalInferenceSession> session();
  Future<void> close();
}

typedef LocalModelLoader = Future<LocalInferenceModel> Function(String path);

/// The runtime never sends a prompt or a conversation to a remote service.
/// Session epochs fence sign-out/sign-in ABA, workspace changes and cancellation.
class AssistantLocalRuntime {
  AssistantLocalRuntime({
    required LocalModelLoader load,
    required Object? Function() currentScope,
  }) : _load = load,
       _currentScope = currentScope;

  final LocalModelLoader _load;
  final Object? Function() _currentScope;
  LocalInferenceModel? _model;
  LocalInferenceSession? _session;
  Object? _scope;
  int _generation = 0;
  bool _busy = false;
  bool _loading = false;
  bool _closed = false;
  Completer<void>? _activeDone;

  bool get ready => !_closed && _model != null && _scope == _currentScope();

  Future<void> load(String verifiedPath) async {
    if (_closed || _loading) throw StateError('Local runtime is unavailable');
    _loading = true;
    try {
      await unload();
      final generation = ++_generation;
      final scope = _currentScope();
      if (scope == null) throw StateError('A current session is required');
      final model = await _load(verifiedPath);
      if (_closed || generation != _generation || scope != _currentScope()) {
        await model.close();
        throw StateError('Local model load was superseded');
      }
      _scope = scope;
      _model = model;
    } finally {
      _loading = false;
    }
  }

  Stream<String> generate(List<LocalChatTurn> history) async* {
    if (!ready || _busy) throw StateError('Local model is not ready');
    _busy = true;
    final done = _activeDone = Completer<void>();
    final generation = ++_generation;
    final scope = _scope;
    bool current() =>
        !_closed && generation == _generation && scope == _currentScope();
    LocalInferenceSession? session;
    try {
      session = await _model!.session();
      if (!current()) return;
      _session = session;
      // Bound context before calling native code; tokenization enforces the
      // model's 2048-token window, with a separate 256 output-token limit.
      var characters = 0;
      final selected = <LocalChatTurn>[];
      for (final turn in history.reversed) {
        if (characters + turn.text.length > 6000) break;
        characters += turn.text.length;
        selected.insert(0, turn);
      }
      if (selected.isEmpty || !selected.last.isUser) {
        throw ArgumentError('The current prompt must fit the local context');
      }
      for (final turn in selected) {
        if (!current()) return;
        await session.add(turn);
      }
      if (!current()) return;
      await for (final token in session.generate()) {
        if (!current()) break;
        yield token;
      }
    } finally {
      try {
        if (session != null) {
          try {
            await session.stop();
          } finally {
            await session.close();
          }
        }
      } finally {
        if (identical(_session, session)) _session = null;
        _busy = false;
        done.complete();
      }
    }
  }

  Future<void> stop() async {
    _generation++;
    await _session?.stop();
  }

  Future<void> stopAndDrain() async {
    await stop();
    await _activeDone?.future;
  }

  Future<void> unload() async {
    final model = _model;
    _model = null;
    _scope = null;
    Object? failure;
    StackTrace? failureStack;
    try {
      await stop();
      await _activeDone?.future;
    } on Object catch (error, stack) {
      failure = error;
      failureStack = stack;
    } finally {
      try {
        await model?.close();
      } on Object catch (error, stack) {
        failure ??= error;
        failureStack ??= stack;
      }
    }
    if (failure != null) Error.throwWithStackTrace(failure, failureStack!);
  }

  Future<void> close() async {
    _closed = true;
    await unload();
  }
}
