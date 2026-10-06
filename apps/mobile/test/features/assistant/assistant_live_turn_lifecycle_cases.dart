part of 'assistant_live_persistence_test.dart';

void _registerLiveTurnLifecycleCases() {
  test(
    'held close refuses new camera and microphone permission requests',
    () async {
      final teardown = Completer<void>();
      when(socket.disconnect).thenAnswer((_) => teardown.future);
      when(_camera.ensurePermission).thenAnswer((_) async => false);
      when(_recorder.ensurePermission).thenAnswer((_) async => false);
      final closing = cubit.close();
      try {
        await _tick();
        await cubit.toggleMicrophone();
        await cubit.toggleCamera();
        verifyNever(_camera.ensurePermission);
        verifyNever(_recorder.ensurePermission);
      } finally {
        teardown.complete();
        await closing;
      }
    },
  );

  for (final nativeFailure in [false, true]) {
    test(
      'close admission is immediate and idempotent failure=$nativeFailure',
      () async {
        final teardown = Completer<void>();
        when(socket.disconnect).thenAnswer((_) => teardown.future);
        clearInteractions(repository);
        clearInteractions(socket);
        final closing = cubit.close();
        expect(identical(closing, cubit.close()), isTrue);
        final outcome = nativeFailure
            ? expectLater(closing, throwsA(isA<ApiException>()))
            : closing;
        try {
          await _tick();
          expect(cubit.isClosed, isFalse);
          await cubit.prepareSession(wsId: 'ws', chatId: 'chat');
          verifyNever(
            () => repository.fetchLiveToken(
              wsId: 'ws',
              chatId: any(named: 'chatId'),
              forceFresh: any(named: 'forceFresh'),
              model: any(named: 'model'),
            ),
          );
          verifyNever(
            () => socket.connect(
              token: any(named: 'token'),
              model: any(named: 'model'),
              seedHistory: any(named: 'seedHistory'),
              sessionHandle: any(named: 'sessionHandle'),
            ),
          );
        } finally {
          if (nativeFailure) {
            teardown.completeError(
              const ApiException(
                message: 'Native unavailable',
                statusCode: 503,
              ),
            );
          } else {
            teardown.complete();
          }
          await outcome;
        }
        expect(cubit.isClosed, isTrue);
        verify(socket.disconnect).called(1);
        verify(player.dispose).called(1);
        await cubit.prepareSession(wsId: 'ws', chatId: 'chat');
        verifyNever(
          () => repository.fetchLiveToken(
            wsId: 'ws',
            chatId: any(named: 'chatId'),
            forceFresh: any(named: 'forceFresh'),
            model: any(named: 'model'),
          ),
        );
      },
    );
  }

  test(
    'explicit End stops local transport and playback while save is held',
    () async {
      final saving = Completer<void>();
      when(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: any(named: 'turnId'),
          model: 'model',
          messages: any(named: 'messages'),
        ),
      ).thenAnswer((_) => saving.future);
      events.add(
        const AssistantLiveSocketTranscriptDelta(
          text: 'Observed final answer',
          isUserInput: false,
        ),
      );
      await _tick();
      final ending = cubit.disconnect(finishTurn: true);
      await _tick();
      try {
        verify(socket.disconnect).called(1);
        verify(player.pause).called(1);
        expect(cubit.state.hasEnded, isTrue);
        expect(cubit.state.status, AssistantLiveConnectionStatus.disconnected);
        expect(
          cubit.state.completedTurns.single.assistantTranscript,
          'Observed final answer',
        );
        events.add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Too late for ended call',
            isUserInput: false,
          ),
        );
        await _tick();
        expect(cubit.state.hasDraft, isFalse);
      } finally {
        saving.complete();
        await ending;
      }
      final messages =
          verify(
                () => repository.persistLiveTurn(
                  wsId: 'ws',
                  chatId: 'chat',
                  turnId: any(named: 'turnId'),
                  model: 'model',
                  messages: captureAny(named: 'messages'),
                ),
              ).captured.single
              as List<Map<String, dynamic>>;
      expect(messages.single['content'], 'Observed final answer');
    },
  );

  test(
    'sealed pending turn publishes final tool state before history completes',
    () async {
      final execution = Completer<Map<String, dynamic>>();
      final saving = Completer<void>();
      when(
        () => repository.executeToolCall(
          wsId: 'ws',
          functionName: 'lookup',
          args: any(named: 'args'),
        ),
      ).thenAnswer((_) => execution.future);
      when(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: any(named: 'turnId'),
          model: 'model',
          messages: any(named: 'messages'),
        ),
      ).thenAnswer((_) => saving.future);
      var emissions = 0;
      final subscription = cubit.stream.listen((state) {
        if (state.completedTurns.isNotEmpty &&
            state.completedTurns.single.partsRevision > 0) {
          emissions++;
        }
      });
      events.add(
        const AssistantLiveSocketToolCall([
          AssistantLiveFunctionCall(
            id: 'lookup-call',
            name: 'lookup',
            args: {},
          ),
        ]),
      );
      await _tick();
      events.add(const AssistantLiveSocketTurnCompleted());
      await _tick();
      expect(
        cubit.state.completedTurns.single.parts.parts.single.state,
        'input-available',
      );
      execution.complete({'summary': 'Synthetic lookup'});
      await _tick();
      expect(
        cubit.state.completedTurns.single.parts.parts.single.state,
        'output-available',
      );
      expect(emissions, greaterThan(0));
      saving.complete();
      await _tick();
      await subscription.cancel();
    },
  );

  test(
    'spoken next turn stays separate while the previous save is pending',
    () async {
      final saving = Completer<void>();
      when(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: any(named: 'turnId'),
          model: 'model',
          messages: any(named: 'messages'),
        ),
      ).thenAnswer((_) => saving.future);
      events
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'First question',
            isUserInput: true,
          ),
        )
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'First answer',
            isUserInput: false,
          ),
        );
      await _tick();
      events.add(const AssistantLiveSocketTurnCompleted());
      await _tick();
      events
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Second question',
            isUserInput: true,
          ),
        )
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Second answer',
            isUserInput: false,
          ),
        );
      await _tick();
      expect(cubit.state.userTranscript, 'Second question');
      expect(cubit.state.assistantTranscript, 'Second answer');
      saving.complete();
      await _tick();
      expect(cubit.state.userTranscript, 'Second question');
      expect(cubit.state.assistantTranscript, 'Second answer');
      events.add(const AssistantLiveSocketTurnCompleted());
      await _tick();
      final writes = verify(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: captureAny(named: 'turnId'),
          model: 'model',
          messages: captureAny(named: 'messages'),
        ),
      ).captured;
      expect(writes.length, 4);
      expect(writes[0], isNot(writes[2]));
      final second = writes[3] as List<Map<String, dynamic>>;
      expect(second.map((message) => message['content']), [
        'Second question',
        'Second answer',
      ]);
    },
  );

  test('explicit End keeps a failed partial turn retryable', () async {
    final order = <String>[];
    when(
      () => repository.clearSessionHandle(wsId: 'ws', scopeKey: 'scope'),
    ).thenAnswer((_) async {});
    when(
      () => repository.persistLiveTurn(
        wsId: 'ws',
        chatId: 'chat',
        turnId: any(named: 'turnId'),
        model: 'model',
        messages: any(named: 'messages'),
      ),
    ).thenAnswer((_) async {
      order.add('persist');
      throw const ApiException(message: 'Unavailable', statusCode: 503);
    });
    when(socket.disconnect).thenAnswer((_) async {
      order.add('disconnect');
    });
    events
      ..add(
        const AssistantLiveSocketTranscriptDelta(
          text: 'Partial question',
          isUserInput: true,
        ),
      )
      ..add(
        const AssistantLiveSocketTranscriptDelta(
          text: 'Partial answer',
          isUserInput: false,
        ),
      );
    await _tick();
    await cubit.disconnect(clearSession: true, finishTurn: true);
    expect(order, unorderedEquals(['disconnect', 'persist']));
    expect(cubit.state.hasEnded, isTrue);
    expect(
      cubit.state.completedTurns.single.assistantTranscript,
      'Partial answer',
    );
    final originalId = cubit.state.completedTurns.single.id;
    when(
      () => repository.persistLiveTurn(
        wsId: 'ws',
        chatId: 'chat',
        turnId: any(named: 'turnId'),
        model: 'model',
        messages: any(named: 'messages'),
      ),
    ).thenAnswer((_) async {});
    await cubit.prepareSession(wsId: 'ws', chatId: 'chat');
    expect(cubit.state.completedTurns, isEmpty);
    verify(
      () => repository.persistLiveTurn(
        wsId: 'ws',
        chatId: 'chat',
        turnId: originalId,
        model: 'model',
        messages: any(named: 'messages'),
      ),
    ).called(2);
  });

  test('privacy teardown never flushes a draft', () async {
    events.add(
      const AssistantLiveSocketTranscriptDelta(
        text: 'Private draft',
        isUserInput: true,
      ),
    );
    await _tick();
    await cubit.disconnect();
    verifyNever(
      () => repository.persistLiveTurn(
        wsId: 'ws',
        chatId: 'chat',
        turnId: any(named: 'turnId'),
        model: 'model',
        messages: any(named: 'messages'),
      ),
    );
    expect(cubit.state.completedTurns, isEmpty);
    expect(cubit.state.hasDraft, isFalse);
    expect(cubit.state.hasEnded, isFalse);
  });

  test(
    'reconnect keeps an accepted save but actor scope ABA drops its refresh',
    () async {
      final saving = Completer<void>();
      when(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: any(named: 'turnId'),
          model: 'model',
          messages: any(named: 'messages'),
        ),
      ).thenAnswer((_) => saving.future);
      events
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Question',
            isUserInput: true,
          ),
        )
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Answer',
            isUserInput: false,
          ),
        );
      await _tick();
      events.add(const AssistantLiveSocketTurnCompleted());
      await _tick();
      final reconnecting = cubit.prepareSession(wsId: 'ws', reconnect: true);
      await _tick();
      expect(cubit.state.completedTurns, hasLength(1));
      saving.complete();
      await reconnecting;
      expect(historyUpdates, 1);
      events.add(
        const AssistantLiveSocketTranscriptDelta(
          text: 'Next',
          isUserInput: true,
        ),
      );
      await _tick();
      scopeToken += 2;
      await cubit.disconnect(finishTurn: true);
      verify(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: any(named: 'turnId'),
          model: 'model',
          messages: any(named: 'messages'),
        ),
      ).called(1);
    },
  );

  test(
    'cumulative transcription finals and duplicate completion persist once',
    () async {
      events
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Question',
            isUserInput: true,
          ),
        )
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Question complete',
            isUserInput: true,
          ),
        )
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Answer',
            isUserInput: false,
          ),
        )
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Answer complete',
            isUserInput: false,
          ),
        )
        ..add(
          const AssistantLiveSocketTranscriptDelta(
            text: 'Answer complete',
            isUserInput: false,
          ),
        );
      await _tick();
      events
        ..add(const AssistantLiveSocketTurnCompleted())
        ..add(const AssistantLiveSocketTurnCompleted());
      await _tick();
      final messages =
          verify(
                () => repository.persistLiveTurn(
                  wsId: 'ws',
                  chatId: 'chat',
                  turnId: any(named: 'turnId'),
                  model: 'model',
                  messages: captureAny(named: 'messages'),
                ),
              ).captured.single
              as List<Map<String, dynamic>>;
      expect(messages.map((message) => message['content']), [
        'Question complete',
        'Answer complete',
      ]);
      expect((messages.last['metadata'] as Map)['parts'], [
        {'type': 'text', 'text': 'Answer complete'},
      ]);
    },
  );

  test(
    'delayed end cannot close or clear a replacement conversation',
    () async {
      final saving = Completer<void>();
      when(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: any(named: 'turnId'),
          model: 'model',
          messages: any(named: 'messages'),
        ),
      ).thenAnswer((_) => saving.future);
      events.add(
        const AssistantLiveSocketTranscriptDelta(
          text: 'Old reply',
          isUserInput: false,
        ),
      );
      await _tick();
      final ending = cubit.disconnect(finishTurn: true);
      await _tick();
      await cubit.prepareSession(wsId: 'ws', forceFresh: true);
      events.add(
        const AssistantLiveSocketTranscriptDelta(
          text: 'New reply',
          isUserInput: false,
        ),
      );
      await _tick();
      saving.complete();
      await ending;
      expect(cubit.state.assistantTranscript, 'New reply');
      expect(cubit.state.hasEnded, isFalse);
      expect(cubit.state.status, AssistantLiveConnectionStatus.connected);
      expect(historyUpdates, 0);
      verify(socket.disconnect).called(1);
    },
  );

  test('logout privacy teardown closes old transport without saving', () async {
    actor = 'replacement actor';
    scopeToken++;
    await cubit.disconnect();
    verify(socket.disconnect).called(1);
    verifyNever(
      () => repository.persistLiveTurn(
        wsId: 'ws',
        chatId: 'chat',
        turnId: any(named: 'turnId'),
        model: 'model',
        messages: any(named: 'messages'),
      ),
    );
    expect(cubit.state.hasDraft, isFalse);
    expect(cubit.state.completedTurns, isEmpty);
  });

  test('deferred retry refuses reconnect after actor scope ABA', () async {
    var attempt = 0;
    final retrying = Completer<void>();
    when(
      () => repository.persistLiveTurn(
        wsId: 'ws',
        chatId: 'chat',
        turnId: any(named: 'turnId'),
        model: 'model',
        messages: any(named: 'messages'),
      ),
    ).thenAnswer((_) async {
      if (attempt++ == 0) {
        throw const ApiException(message: 'Unavailable', statusCode: 503);
      }
      await retrying.future;
    });
    events.add(
      const AssistantLiveSocketTranscriptDelta(
        text: 'Retry this answer',
        isUserInput: false,
      ),
    );
    await _tick();
    events.add(const AssistantLiveSocketTurnCompleted());
    await _tick();
    expect(cubit.state.completedTurns, hasLength(1));
    clearInteractions(repository);
    final reconnecting = cubit.prepareSession(wsId: 'ws', reconnect: true);
    await _tick();
    actor = 'replacement';
    actor = null;
    scopeToken += 2;
    retrying.complete();
    await reconnecting;
    verifyNever(
      () => repository.fetchLiveToken(
        wsId: 'ws',
        chatId: any(named: 'chatId'),
        forceFresh: any(named: 'forceFresh'),
        model: any(named: 'model'),
      ),
    );
    expect(historyUpdates, 0);
  });
}
