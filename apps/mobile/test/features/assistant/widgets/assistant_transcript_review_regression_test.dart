import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';
import '../cubit/assistant_chat_persistence_actions_harness.dart';

void main() {
  setUpAll(registerActionOperationFallbacks);

  testWidgets(
    'conversation ABA exposes effective refresh fence on a fresh row',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final api = ActionsApi();
      final journal = ActionsReactionJournal();
      final repository = ActionsRepository(api, reactionJournal: journal);
      final preferences = ActionsPreferences();
      when(
        () => preferences.saveChatId(
          any(),
          any(),
          shouldWrite: any(named: 'shouldWrite'),
        ),
      ).thenAnswer((_) async {});
      final cubit = actionsCubit(repository, preferences);
      addTearDown(() async {
        await cubit.close();
        await repository.frames.close();
      });
      final bodies = <Map<String, dynamic>>[];
      final replayEntered = Completer<void>();
      final releaseReplay = Completer<Map<String, dynamic>>();
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) {
          expect(
            call.positionalArguments.first,
            '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
            '$actionChat/reactions',
          );
          bodies.add(Map<String, dynamic>.of(body));
          if (bodies.length == 1) throw StateError('Dispatch outcome unknown');
          expect(bodies, hasLength(2));
          expect(body, bodies.first);
          replayEntered.complete();
          return releaseReplay.future;
        }),
      );
      await cubit.openChatById(actionWorkspace, actionChat);
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unknown,
      );
      expect(cubit.state.messages.single.reactionRefreshRequired, isTrue);
      expect(bodies, hasLength(1));
      final originalOpId = bodies.single['opId'];
      expect(originalOpId, isA<String>());
      expect(bodies.single, {
        'messageId': actionMessage,
        'emoji': 'heart',
        'present': true,
        'opId': originalOpId,
      });
      await cubit.openChatById(actionWorkspace, actionOther);
      await cubit.openChatById(actionWorkspace, actionChat);
      expect(cubit.state.messages.single.reactionRefreshRequired, isFalse);
      expect(cubit.needsReactionRefresh(actionMessage), isTrue);
      expect(cubit.canPersistMessage(actionMessage), isTrue);

      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      expect(bodies, hasLength(1));

      final readEntered = Completer<void>();
      final releaseRead = Completer<Map<String, dynamic>>();
      var freshReads = 0;
      when(() => api.getJson(any())).thenAnswer((call) {
        expect(
          call.positionalArguments.single,
          '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
          '$actionChat/reactions?messageId=$actionMessage',
        );
        freshReads++;
        readEntered.complete();
        return releaseRead.future;
      });
      final refreshResult = Completer<AssistantReactionResult>();
      var replyCallbacks = 0;
      var toggleCallbacks = 0;
      await tester.pumpApp(
        Scaffold(
          body: SingleChildScrollView(
            child: StreamBuilder<AssistantChatState>(
              stream: cubit.stream,
              initialData: cubit.state,
              builder: (context, snapshot) => AssistantTranscriptSection(
                chatState: snapshot.requireData,
                liveState: const AssistantLiveState(),
                assistantName: 'Mira',
                actorId: actionActor,
                canPersistMessage: cubit.canPersistMessage,
                needsReactionRefresh: cubit.needsReactionRefresh,
                isActionCurrent: () => !cubit.isClosed,
                onReply: (_) => replyCallbacks++,
                onReact: (_, _) => toggleCallbacks++,
                onRefreshReactions: (id) {
                  expect(id, actionMessage);
                  unawaited(
                    cubit.refreshReactions(id).then(refreshResult.complete),
                  );
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.longPress(find.text('Current content', findRichText: true));
      await tester.pumpAndSettle();
      expect(find.text('Refresh reactions'), findsOneWidget);
      expect(find.text('Reply'), findsOneWidget);
      expect(find.byKey(const ValueKey('assistant-react-like')), findsNothing);
      await tester.tap(find.text('Refresh reactions'));
      await tester.pumpAndSettle();
      expect(replayEntered.isCompleted, isTrue);
      expect(readEntered.isCompleted, isFalse);
      expect(refreshResult.isCompleted, isFalse);
      expect(cubit.needsReactionRefresh(actionMessage), isTrue);
      expect(freshReads, 0);
      expect(bodies, hasLength(2));
      expect(bodies.last, bodies.first);
      expect(bodies.last['opId'], originalOpId);
      expect(journal.intents.values.single.opId, originalOpId);
      expect(replyCallbacks, 0);
      expect(toggleCallbacks, 0);
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.busy,
      );
      expect(
        await cubit.refreshReactions(actionMessage),
        AssistantReactionResult.busy,
      );
      expect(bodies, hasLength(2));
      expect(freshReads, 0);

      releaseReplay.complete(actionOperationReceipt(bodies.last));
      await tester.pumpAndSettle();
      expect(readEntered.isCompleted, isTrue);
      expect(refreshResult.isCompleted, isFalse);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      expect(journal.intents, isEmpty);
      expect(freshReads, 1);
      expect(bodies, hasLength(2));
      releaseRead.complete({'message': actionReceipt()});
      await tester.pumpAndSettle();
      expect(refreshResult.isCompleted, isTrue);
      expect(await refreshResult.future, AssistantReactionResult.updated);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      expect(cubit.state.messages.single.reactionRefreshRequired, isFalse);
      expect(cubit.state.messages.single.parts.single.text, 'Current content');
      expect(cubit.state.messages.single.reactions.single.userIds, [
        actionActor,
      ]);
      await tester.pumpAndSettle();
      await tester.longPress(find.text('Current content', findRichText: true));
      await tester.pumpAndSettle();
      expect(find.text('Refresh reactions'), findsNothing);
      expect(find.text('Reply'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('assistant-react-like')),
        findsOneWidget,
      );
      expect(replyCallbacks, 0);
      expect(toggleCallbacks, 0);
      expect(bodies, hasLength(2));
      expect(bodies.last['opId'], originalOpId);
      expect(journal.intents, isEmpty);
      expect(freshReads, 1);
      verifyNever(() => api.postJson(any(), any()));
      verifyNever(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      );
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
