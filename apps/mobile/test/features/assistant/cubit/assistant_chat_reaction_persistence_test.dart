import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'assistant_chat_persistence_actions_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => registerFallbackValue(() => true));
  late ActionsApi api;
  late ActionsRepository repository;
  late AssistantChatCubit cubit;
  late Completer<Map<String, dynamic>> write;
  late List<Map<String, dynamic>> bodies;
  late List<bool Function()> leases;
  var sends = 0;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    api = ActionsApi();
    repository = ActionsRepository(api);
    final preferences = ActionsPreferences();
    when(
      () => preferences.saveChatId(
        any(),
        any(),
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenAnswer((_) async {});
    cubit = actionsCubit(repository, preferences);
    write = Completer<Map<String, dynamic>>();
    bodies = [];
    leases = [];
    sends = 0;
    when(
      () => api.postJsonAcknowledged(
        any(),
        any(),
        actorId: any(named: 'actorId'),
        isCurrent: any(named: 'isCurrent'),
      ),
    ).thenAnswer((call) {
      sends++;
      expect(call.namedArguments[#actorId], repository.actor);
      bodies.add(call.positionalArguments[1] as Map<String, dynamic>);
      leases.add(call.namedArguments[#isCurrent] as bool Function());
      return write.future;
    });
    await cubit.openChatById(actionWorkspace, actionChat);
  });
  tearDown(() async {
    await cubit.close();
    await repository.frames.close();
  });

  test(
    'one acknowledged actor-owned body patches summaries and scoped cache',
    () async {
      final result = cubit.toggleReaction(actionMessage, 'heart');
      await Future<void>.delayed(Duration.zero);
      expect(sends, 1);
      expect(bodies.single, {'messageId': actionMessage, 'emoji': 'heart'});
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.busy,
      );
      write.complete({'message': actionReceipt()});
      expect(await result, AssistantReactionResult.updated);
      final row = cubit.state.messages.single;
      expect(row.parts.single.text, 'Current content');
      expect(row.reactions.single.userIds, [actionActor]);
      expect(row.reactionRefreshRequired, isFalse);
      expect(row.isPersisted, isTrue);
      expect(repository.snapshots.last.origin.key.userId, actionActor);
      expect(repository.snapshots.last.origin.key.workspaceId, actionWorkspace);
      expect(repository.snapshots.last.restored.messages.single, row);
      verifyNever(() => api.postJson(any(), any()));
    },
  );

  test(
    'reaction completion preserves content changed while POST was pending',
    () async {
      await cubit.submit(
        wsId: actionWorkspace,
        message: 'Next turn',
        modelId: 'model',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: actionWorkspace,
        timezone: 'UTC',
      );
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final result = cubit.toggleReaction(actionMessage, 'heart');
      await Future<void>.delayed(Duration.zero);
      repository.frames
        ..add(
          const AssistantJsonStreamEvent({
            'type': 'start',
            'messageId': actionMessage,
          }),
        )
        ..add(
          const AssistantJsonStreamEvent({
            'type': 'text-delta',
            'delta': ' extended',
          }),
        );
      write.complete({'message': actionReceipt()});
      expect(await result, AssistantReactionResult.updated);
      final row = cubit.state.messages.firstWhere((m) => m.id == actionMessage);
      expect(row.parts.single.text, 'Current content extended');
      expect(row.reactions.single.count, 1);
      expect(cubit.state.messages.where((m) => m.role == 'user'), hasLength(1));
    },
  );

  test('unknown toggle stays fenced after fresh read; '
      'no replay or invented success', () async {
    final result = cubit.toggleReaction(actionMessage, 'heart');
    await Future<void>.delayed(Duration.zero);
    write.completeError(StateError('Synthetic uncertain transport'));
    expect(await result, AssistantReactionResult.unknown);
    expect(cubit.state.messages.single.reactions, isEmpty);
    expect(cubit.needsReactionRefresh(actionMessage), isTrue);
    expect(
      repository
          .snapshots
          .last
          .restored
          .messages
          .single
          .reactionRefreshRequired,
      isTrue,
    );
    expect(
      await cubit.toggleReaction(actionMessage, 'heart'),
      AssistantReactionResult.refreshRequired,
    );
    expect(sends, 1);
    final refresh = Completer<Map<String, dynamic>>();
    when(() => api.getJson(any())).thenAnswer((_) => refresh.future);
    final read = cubit.refreshReactions(actionMessage);
    expect(
      await cubit.toggleReaction(actionMessage, 'heart'),
      AssistantReactionResult.busy,
    );
    refresh.complete({
      'messages': [actionReceipt()],
    });
    expect(await read, AssistantReactionResult.unknown);
    expect(cubit.needsReactionRefresh(actionMessage), isTrue);
    expect(cubit.state.messages.single.parts.single.text, 'Current content');
    expect(sends, 1);
    final explicitRetry = cubit.toggleReaction(actionMessage, 'heart');
    expect(await explicitRetry, AssistantReactionResult.refreshRequired);
    expect(sends, 1);
    expect(cubit.state.messages.single.reactions.single.count, 1);
  });

  test(
    'refresh cannot release a timed-out toggle that can still commit',
    () async {
      when(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((_) {
        sends++;
        return write.future.timeout(Duration.zero);
      });
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unknown,
      );
      expect(write.isCompleted, isFalse);
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'messages': [
            {...actionReceipt(), 'reactions': <Map<String, dynamic>>[]},
          ],
        },
      );
      expect(
        await cubit.refreshReactions(actionMessage),
        AssistantReactionResult.unknown,
      );
      expect(cubit.state.messages.single.reactions, isEmpty);
      write.complete({'message': actionReceipt()});
      await Future<void>.delayed(Duration.zero);
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      expect(sends, 1);
      expect(cubit.needsReactionRefresh(actionMessage), isTrue);
    },
  );

  test('missing refresh target keeps uncertainty and blocks retry', () async {
    final result = cubit.toggleReaction(actionMessage, 'heart');
    await Future<void>.delayed(Duration.zero);
    write.completeError(StateError('Synthetic unknown'));
    await result;
    when(
      () => api.getJson(any()),
    ).thenAnswer((_) async => {'messages': <Map<String, dynamic>>[]});
    expect(
      await cubit.refreshReactions(actionMessage),
      AssistantReactionResult.refreshRequired,
    );
    expect(
      await cubit.toggleReaction(actionMessage, 'heart'),
      AssistantReactionResult.refreshRequired,
    );
    expect(sends, 1);
  });

  for (final boundary in ['actor', 'workspace', 'conversation', 'ABA']) {
    test(
      '$boundary change retires response and cannot patch current rows',
      () async {
        final result = cubit.toggleReaction(actionMessage, 'heart');
        await Future<void>.delayed(Duration.zero);
        switch (boundary) {
          case 'actor':
            repository.actor = actionOther;
          case 'workspace':
            await cubit.openChatById(actionOther, actionChat);
          case 'conversation':
            await cubit.openChatById(actionWorkspace, actionOther);
          case 'ABA':
            await cubit.openChatById(actionWorkspace, actionOther);
            await cubit.openChatById(actionWorkspace, actionChat);
        }
        expect(leases.single(), isFalse);
        final publications = repository.snapshots.length;
        write.complete({'message': actionReceipt()});
        expect(await result, AssistantReactionResult.stale);
        expect(cubit.state.messages.single.reactions, isEmpty);
        expect(repository.snapshots.length, publications);
        if (boundary == 'ABA') {
          expect(cubit.needsReactionRefresh(actionMessage), isTrue);
          expect(
            await cubit.toggleReaction(actionMessage, 'heart'),
            AssistantReactionResult.refreshRequired,
          );
        }
        expect(sends, 1);
      },
    );
  }

  test('observed actor ABA permanently retires transport lease', () async {
    final result = cubit.toggleReaction(actionMessage, 'heart');
    await Future<void>.delayed(Duration.zero);
    repository.actor = actionOther;
    expect(leases.single(), isFalse);
    repository.actor = actionActor;
    expect(leases.single(), isFalse);
    write.complete({'message': actionReceipt()});
    expect(await result, AssistantReactionResult.stale);
    expect(cubit.state.messages.single.reactions, isEmpty);
  });
}
