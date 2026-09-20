import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantRepository {}

class _Preferences extends Mock implements AssistantPreferences {}

void main() {
  late _Repository repository;
  late _Preferences preferences;
  late AssistantChatCubit cubit;
  const restored = AssistantRestoredChat(
    chat: AssistantChatRecord(id: 'cached'),
    messages: [],
    attachmentsByMessageId: {},
  );

  setUp(() {
    repository = _Repository();
    preferences = _Preferences();
    when(repository.generateUuid).thenReturn('new-chat');
    when(() => preferences.loadChatId(any())).thenAnswer((_) async => 'cached');
    when(() => preferences.saveChatId(any(), any())).thenAnswer((_) async {});
    when(() => preferences.clearChatId(any())).thenAnswer((_) async {});
    when(
      () => preferences.saveWorkspaceContextId(any(), any()),
    ).thenAnswer((_) async {});
    when(
      () => repository.restoreChat(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
      ),
    ).thenAnswer((_) async => restored);
    when(
      () => repository.fetchRecentChats(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async => []);
    cubit = AssistantChatCubit(
      repository: repository,
      preferences: preferences,
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    addTearDown(cubit.close);
  });

  test('cached conversation renders before delayed history', () async {
    final history = Completer<List<AssistantChatRecord>>();
    when(
      () => repository.fetchRecentChats(wsId: 'ws'),
    ).thenAnswer((_) => history.future);
    await cubit.loadWorkspace('ws');
    expect(cubit.state.status, AssistantChatStatus.idle);
    expect(cubit.state.chat?.id, 'cached');
    expect(history.isCompleted, isFalse);
    history.complete([const AssistantChatRecord(id: 'history')]);
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.history.single.id, 'history');
  });

  test('history failure does not hide a restored conversation', () async {
    when(
      () => repository.fetchRecentChats(wsId: 'ws'),
    ).thenThrow(Exception('offline'));
    await cubit.loadWorkspace('ws');
    expect(cubit.state.chat?.id, 'cached');
    expect(cubit.state.status, AssistantChatStatus.idle);
    expect(cubit.state.error, isNull);
  });

  test('a new workspace rejects delayed restore and history', () async {
    final restore = Completer<AssistantRestoredChat?>();
    final history = Completer<List<AssistantChatRecord>>();
    when(
      () => repository.restoreChat(wsId: 'old', chatId: 'cached'),
    ).thenAnswer((_) => restore.future);
    when(
      () => repository.fetchRecentChats(wsId: 'old'),
    ).thenAnswer((_) => history.future);
    final loading = cubit.loadWorkspace('old');
    await Future<void>.delayed(Duration.zero);
    await cubit.loadWorkspace('new');
    restore.complete(
      const AssistantRestoredChat(
        chat: AssistantChatRecord(id: 'old-chat'),
        messages: [],
        attachmentsByMessageId: {},
      ),
    );
    history.complete([const AssistantChatRecord(id: 'old-history')]);
    await loading;
    expect(cubit.state.workspaceId, 'new');
    expect(cubit.state.chat?.id, 'cached');
    expect(cubit.state.history, isEmpty);
  });

  test('starting a new conversation cancels an outstanding restore', () async {
    final restore = Completer<AssistantRestoredChat?>();
    when(
      () => repository.restoreChat(wsId: 'ws', chatId: 'cached'),
    ).thenAnswer((_) => restore.future);
    final loading = cubit.loadWorkspace('ws');
    await Future<void>.delayed(Duration.zero);
    await cubit.resetConversation('ws');
    restore.complete(restored);
    await loading;
    expect(cubit.state.chat, isNull);
    expect(cubit.state.messages, isEmpty);
    expect(cubit.state.status, AssistantChatStatus.idle);
  });
}
