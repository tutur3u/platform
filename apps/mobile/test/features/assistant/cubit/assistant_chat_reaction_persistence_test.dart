import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'assistant_chat_persistence_actions_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(registerActionOperationFallbacks);
  late ActionsApi api;
  late ActionsRepository repository;
  late ActionsReactionJournal journal;
  late AssistantChatCubit cubit;
  late Completer<Map<String, dynamic>> write;
  late List<Map<String, dynamic>> bodies;
  late List<ApiMutationAdmission> admissions;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    api = ActionsApi();
    journal = ActionsReactionJournal();
    repository = ActionsRepository(api, reactionJournal: journal);
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
    admissions = [];
    when(
      () => api.putJsonOperationAcknowledged(
        any(),
        any(),
        admission: any(named: 'admission'),
        onAcknowledged: any(named: 'onAcknowledged'),
      ),
    ).thenAnswer(
      (call) => acknowledgeActionOperation(call, (body) {
        final admission =
            call.namedArguments[#admission] as ApiMutationAdmission;
        expect(admission.actorId, repository.actor);
        admissions.add(admission);
        bodies.add(body);
        return write.future;
      }),
    );
    await cubit.openChatById(actionWorkspace, actionChat);
  });
  tearDown(() async {
    await cubit.close();
    await repository.frames.close();
  });

  test(
    'actor-owned desired state patches only summaries and scoped cache',
    () async {
      final result = cubit.toggleReaction(actionMessage, 'heart');
      await Future<void>.delayed(Duration.zero);
      expect(bodies, hasLength(1));
      expect(bodies.single, {
        'messageId': actionMessage,
        'emoji': 'heart',
        'present': true,
        'opId': isA<String>().having(isUuid, 'valid operation UUID', isTrue),
      });
      expect(journal.intents.values.single.toJson(), {
        'opId': bodies.single['opId'],
        'emoji': 'heart',
        'present': true,
      });
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.busy,
      );
      write.complete(actionOperationReceipt(bodies.single));
      expect(await result, AssistantReactionResult.updated);
      final row = cubit.state.messages.single;
      expect(row.parts.single.text, 'Current content');
      expect(row.reactions.single.userIds, [actionActor]);
      expect(row.reactionRefreshRequired, isFalse);
      expect(row.isPersisted, isTrue);
      expect(journal.intents, isEmpty);
      expect(repository.snapshots.last.origin.key.userId, actionActor);
      expect(repository.snapshots.last.origin.key.workspaceId, actionWorkspace);
      expect(repository.snapshots.last.restored.messages.single, row);
      verifyNever(() => api.postJson(any(), any()));
    },
  );

  test('receipt preserves content changed while PUT was pending', () async {
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
    write.complete(actionOperationReceipt(bodies.single));
    expect(await result, AssistantReactionResult.updated);
    final row = cubit.state.messages.firstWhere((m) => m.id == actionMessage);
    expect(row.parts.single.text, 'Current content extended');
    expect(row.reactions.single.count, 1);
    expect(cubit.state.messages.where((m) => m.role == 'user'), hasLength(1));
  });

  test(
    'unknown operation replays its persisted intent before exact read',
    () async {
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
      final original = Map<String, dynamic>.of(bodies.single);
      final order = <String>[];
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) async {
          order.add('replay');
          expect(body, original);
          bodies.add(body);
          return actionOperationReceipt(body);
        }),
      );
      when(() => api.getJson(any())).thenAnswer((call) async {
        order.add('read');
        expect(
          call.positionalArguments.single,
          '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
          '$actionChat/reactions?messageId=$actionMessage',
        );
        return {'message': actionReceipt()};
      });
      expect(
        await cubit.refreshReactions(actionMessage),
        AssistantReactionResult.updated,
      );
      expect(order, ['replay', 'read']);
      expect(bodies, hasLength(2));
      expect(journal.intents, isEmpty);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      expect(cubit.state.messages.single.parts.single.text, 'Current content');
      expect(cubit.state.messages.single.reactions.single.count, 1);
    },
  );

  test(
    'late timed-out original and replay share identity and cannot invert',
    () async {
      final original = Completer<void>();
      final originalAcknowledged = Completer<void>();
      final applied = <String>{};
      var present = false;
      var dispatches = 0;
      final requests = <Map<String, dynamic>>[];
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer((call) {
        final first = dispatches++ == 0;
        final operation = acknowledgeActionOperation(call, (body) async {
          requests.add(Map<String, dynamic>.of(body));
          if (first) await original.future;
          if (applied.add(body['opId'] as String)) {
            present = body['present'] as bool;
          }
          return actionOperationReceipt(body);
        });
        if (!first) return operation;
        unawaited(operation.then((_) => originalAcknowledged.complete()));
        return operation.timeout(Duration.zero);
      });
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unknown,
      );
      expect(original.isCompleted, isFalse);
      when(() => api.getJson(any())).thenAnswer((_) async {
        expect(present, isTrue);
        return {'message': actionReceipt()};
      });
      expect(
        await cubit.refreshReactions(actionMessage),
        AssistantReactionResult.updated,
      );
      expect(requests, hasLength(2));
      expect(requests[1], requests[0]);
      expect(applied, hasLength(1));
      original.complete();
      await originalAcknowledged.future;
      expect(present, isTrue);
      expect(applied, hasLength(1));
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      expect(journal.intents, isEmpty);
      expect(cubit.state.messages.single.reactions.single.count, 1);
    },
  );

  test(
    'missing exact target retains refresh fence without a blind toggle',
    () async {
      final pending = cubit.toggleReaction(actionMessage, 'heart');
      await Future<void>.delayed(Duration.zero);
      write.completeError(StateError('Unknown'));
      await pending;
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) async {
          bodies.add(body);
          return actionOperationReceipt(body);
        }),
      );
      when(() => api.getJson(any())).thenAnswer((_) async => {});
      expect(
        await cubit.refreshReactions(actionMessage),
        AssistantReactionResult.refreshRequired,
      );
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      expect(bodies, hasLength(2));
      expect(bodies[1], bodies[0]);
    },
  );

  for (final boundary in ['actor', 'workspace', 'conversation', 'ABA']) {
    test(
      '$boundary departure cleans origin without patching current rows',
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
        expect(admissions.single.current, isFalse);
        final publications = repository.snapshots.length;
        write.complete(actionOperationReceipt(bodies.single));
        expect(await result, AssistantReactionResult.stale);
        expect(journal.intents, isEmpty);
        expect(cubit.state.messages.single.reactions, isEmpty);
        expect(repository.snapshots.length, publications);
        expect(bodies, hasLength(1));
      },
    );
  }

  test('observed actor ABA permanently retires dispatch admission', () async {
    final result = cubit.toggleReaction(actionMessage, 'heart');
    await Future<void>.delayed(Duration.zero);
    repository.actor = actionOther;
    expect(admissions.single.current, isFalse);
    repository.actor = actionActor;
    expect(admissions.single.current, isFalse);
    write.complete(actionOperationReceipt(bodies.single));
    expect(await result, AssistantReactionResult.stale);
    expect(journal.intents, isEmpty);
    expect(cubit.state.messages.single.reactions, isEmpty);
  });
}
