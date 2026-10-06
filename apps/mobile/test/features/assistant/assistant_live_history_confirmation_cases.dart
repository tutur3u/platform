part of 'assistant_live_persistence_test.dart';

class _ChatRepository extends Mock implements AssistantRepository {}

class _ChatPreferences extends Mock implements AssistantPreferences {}

void _registerLiveHistoryConfirmationCases() {
  for (final boundary in [
    'complete',
    'failed',
    'workspace',
    'conversation',
    'turn',
    'partial roles',
    'empty expected roles',
  ]) {
    test('history confirmation refuses $boundary boundary unless complete', () {
      final confirmed = isAssistantLiveTurnHistoryConfirmed(
        loadedWorkspaceId: boundary == 'workspace' ? 'other-workspace' : 'ws',
        loadedConversationId: boundary == 'conversation'
            ? 'other-chat'
            : 'chat',
        restoreSucceeded: boundary != 'failed',
        messages: [
          AssistantMessage(
            id: 'response',
            role: 'assistant',
            liveTurnId: boundary == 'turn' ? 'other-turn' : 'turn',
          ),
          if (boundary != 'partial roles')
            const AssistantMessage(
              id: 'input',
              role: 'user',
              liveTurnId: 'turn',
            ),
        ],
        workspaceId: 'ws',
        conversationId: 'chat',
        turnId: 'turn',
        expectedRoles: boundary == 'empty expected roles'
            ? {}
            : {'user', 'assistant'},
      );
      expect(confirmed, boundary == 'complete');
    });
  }

  test(
    'successful write retains turn when actual Chat restore returns error',
    () async {
      final chatRepository = _ChatRepository();
      final preferences = _ChatPreferences();
      when(chatRepository.generateUuid).thenReturn('synthetic-chat');
      when(
        () => chatRepository.fetchRecentChats(wsId: 'ws'),
      ).thenAnswer((_) async => []);
      when(
        () => chatRepository.restoreChat(
          wsId: 'ws',
          chatId: 'live:chat',
          forceRefresh: true,
        ),
      ).thenThrow(const ApiException(message: 'Unavailable', statusCode: 503));
      final chat = AssistantChatCubit(
        repository: chatRepository,
        preferences: preferences,
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {},
      );
      addTearDown(chat.close);
      _confirmTurnHistory = (wsId, chatId, turnId, roles) =>
          isAssistantLiveTurnHistoryConfirmed(
            loadedWorkspaceId: chat.state.workspaceId,
            loadedConversationId: chat.state.chat?.id,
            restoreSucceeded:
                chat.state.status == AssistantChatStatus.idle &&
                chat.state.error == null &&
                chat.state.hasLoadedOnce,
            messages: chat.state.messages,
            workspaceId: wsId,
            conversationId: 'live:$chatId',
            turnId: turnId,
            expectedRoles: roles,
          );
      _updateHistory = () async {
        await chat.openChatById('ws', 'live:chat');
        await chat.refreshHistory();
      };
      events.add(const AssistantLiveSocketTextDelta('Saved but still visible'));
      await _tick();
      events.add(const AssistantLiveSocketTurnCompleted());
      await _tick();
      expect(chat.state.status, AssistantChatStatus.error);
      verify(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: any(named: 'turnId'),
          model: 'model',
          messages: any(named: 'messages'),
        ),
      ).called(1);
      expect(cubit.state.completedTurns, hasLength(1));
      expect(
        cubit.state.completedTurns.single.assistantText,
        'Saved but still visible',
      );
      expect(cubit.state.isPersisting, isFalse);
      final turnId = cubit.state.completedTurns.single.id;
      clearInteractions(repository);
      when(
        () => preferences.saveChatId(
          any(),
          any(),
          shouldWrite: any(named: 'shouldWrite'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => chatRepository.restoreChat(
          wsId: 'ws',
          chatId: 'live:chat',
          forceRefresh: true,
        ),
      ).thenAnswer(
        (_) async => AssistantRestoredChat(
          chat: const AssistantChatRecord(id: 'live:chat'),
          messages: [
            AssistantMessage(
              id: 'restored-response',
              role: 'assistant',
              liveTurnId: turnId,
            ),
          ],
          attachmentsByMessageId: const {},
        ),
      );
      await cubit.prepareSession(wsId: 'ws', chatId: 'chat');
      expect(chat.state.status, AssistantChatStatus.idle);
      expect(cubit.state.completedTurns, isEmpty);
      expect(historyUpdates, 2);
      verifyNever(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: any(named: 'turnId'),
          model: 'model',
          messages: any(named: 'messages'),
        ),
      );
    },
  );
}
