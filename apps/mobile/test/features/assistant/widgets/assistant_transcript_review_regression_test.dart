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
  setUpAll(() => registerFallbackValue(() => true));

  testWidgets(
    'conversation ABA exposes effective refresh fence on a fresh row',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final api = ActionsApi();
      final repository = ActionsRepository(api);
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
      var posts = 0;
      when(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((_) async {
        posts++;
        if (posts == 1) throw StateError('Dispatch outcome unknown');
        return {'message': actionReceipt()};
      });
      await cubit.openChatById(actionWorkspace, actionChat);
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unknown,
      );
      expect(cubit.state.messages.single.reactionRefreshRequired, isTrue);
      await cubit.openChatById(actionWorkspace, actionOther);
      await cubit.openChatById(actionWorkspace, actionChat);
      expect(cubit.state.messages.single.reactionRefreshRequired, isFalse);
      expect(cubit.needsReactionRefresh(actionMessage), isTrue);
      expect(cubit.canPersistMessage(actionMessage), isTrue);

      final refreshEntered = Completer<void>();
      final releaseRead = Completer<Map<String, dynamic>>();
      var freshReads = 0;
      when(() => api.getJson(any())).thenAnswer((call) {
        expect(
          call.positionalArguments.single,
          '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
          '$actionChat/messages?limit=100',
        );
        freshReads++;
        refreshEntered.complete();
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
      await refreshEntered.future;
      expect(refreshResult.isCompleted, isFalse);
      expect(cubit.needsReactionRefresh(actionMessage), isTrue);
      expect(freshReads, 1);
      expect(posts, 1);
      expect(replyCallbacks, 0);
      expect(toggleCallbacks, 0);

      releaseRead.complete({
        'messages': [actionReceipt()],
      });
      expect(await refreshResult.future, AssistantReactionResult.unknown);
      expect(cubit.needsReactionRefresh(actionMessage), isTrue);
      expect(cubit.state.messages.single.parts.single.text, 'Current content');
      expect(cubit.state.messages.single.reactions.single.userIds, [
        actionActor,
      ]);
      await tester.pumpAndSettle();
      await tester.longPress(find.text('Current content', findRichText: true));
      await tester.pumpAndSettle();
      expect(find.text('Refresh reactions'), findsOneWidget);
      expect(find.byKey(const ValueKey('assistant-react-like')), findsNothing);
      expect(toggleCallbacks, 0);
      expect(posts, 1);
      expect(freshReads, 1);
      // A read cannot prove the earlier timed-out mutation is terminal.
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      expect(posts, 1);
      verifyNever(() => api.postJson(any(), any()));
    },
  );
}
