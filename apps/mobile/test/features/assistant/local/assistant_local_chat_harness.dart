import 'dart:async';
import 'dart:io';

import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_history.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_model_store.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

class LocalTestStore extends AssistantLocalModelStore {
  bool installed = true;
  @override
  Future<File?> verifiedFile(AssistantLocalModel model) async =>
      installed ? File('/verified/${model.id}') : null;
  @override
  Future<void> remove(AssistantLocalModel model) async => installed = false;
}

class LocalTestHistory extends AssistantLocalHistory {
  final rows = <String, List<AssistantMessage>>{};
  int saves = 0;
  @override
  Future<List<AssistantMessage>> load({
    required String actor,
    required String workspace,
    required String model,
    required bool Function() isScopeCurrent,
  }) async => isScopeCurrent() ? rows['$actor/$workspace/$model'] ?? [] : [];
  @override
  Future<void> save({
    required String actor,
    required String workspace,
    required String model,
    required List<AssistantMessage> messages,
    required bool Function() isScopeCurrent,
  }) async {
    if (!isScopeCurrent()) throw StateError('Stale scope');
    saves++;
    rows['$actor/$workspace/$model'] = messages;
  }

  @override
  Future<void> clear({
    required String actor,
    required String workspace,
    required String model,
    required bool Function() isScopeCurrent,
  }) async {
    if (!isScopeCurrent()) throw StateError('Stale scope');
    rows.remove('$actor/$workspace/$model');
  }
}

class LocalTestSession implements LocalInferenceSession {
  final tokens = StreamController<String>();
  final started = Completer<void>();
  final turns = <LocalChatTurn>[];
  bool closed = false;
  Error? stopError;
  @override
  Future<void> add(LocalChatTurn turn) async => turns.add(turn);
  @override
  Stream<String> generate() {
    started.complete();
    return tokens.stream;
  }

  @override
  Future<void> stop() async {
    if (!tokens.isClosed) unawaited(tokens.close());
    if (stopError != null) throw stopError!;
  }

  @override
  Future<void> close() async => closed = true;
}

class LocalTestModel implements LocalInferenceModel {
  final sessions = <LocalTestSession>[];
  final firstSession = Completer<LocalTestSession>();
  bool closed = false;
  @override
  Future<LocalInferenceSession> session() async {
    final session = LocalTestSession();
    sessions.add(session);
    if (!firstSession.isCompleted) firstSession.complete(session);
    return session;
  }

  @override
  Future<void> close() async => closed = true;
}

class LocalChatHarness {
  Object scope = Object();
  final store = LocalTestStore();
  final history = LocalTestHistory();
  final model = LocalTestModel();
  bool supported = true;
  bool failLoad = false;
  Completer<LocalInferenceModel>? loadBarrier;
  final loading = Completer<void>();
  late final preferences = AssistantLocalPreferences(
    currentUserId: () => 'user',
  );
  late final cubit = AssistantLocalChatCubit(
    currentScope: () => scope,
    store: store,
    history: history,
    preferences: preferences,
    supported: () async => supported,
    runtime: AssistantLocalRuntime(
      currentScope: () => scope,
      load: (_) async {
        if (failLoad) throw StateError('Native load failed');
        if (!loading.isCompleted) loading.complete();
        return await (loadBarrier?.future ?? Future.value(model));
      },
    ),
  );
  Future<void> activate() async {
    await cubit.syncWorkspace('user', 'workspace');
    await cubit.select(assistantLocalModels.first.id);
  }
}
