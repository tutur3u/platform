import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mocktail/mocktail.dart';

import 'assistant_chat_persistence_actions_harness.dart';

class _LifecycleBox extends Mock implements Box<dynamic> {
  final markers = <dynamic, dynamic>{};
  final putEntered = Completer<void>();
  final putRelease = Completer<void>();
  @override
  Iterable<dynamic> get keys => markers.keys;
  @override
  bool containsKey(dynamic key) => markers.containsKey(key);
  @override
  dynamic get(dynamic key, {dynamic defaultValue}) =>
      markers.containsKey(key) ? markers[key] : defaultValue;
  @override
  Future<void> put(dynamic key, dynamic value) async {
    if (!putEntered.isCompleted) putEntered.complete();
    await putRelease.future;
    markers[key] = value;
  }

  @override
  Future<void> delete(dynamic key) async {
    markers.remove(key);
  }

  @override
  Future<void> deleteAll(Iterable<dynamic> keys) async {
    keys.toList().forEach(markers.remove);
  }

  @override
  Future<void> flush() async {}
}

class _ReceiptJournal extends AssistantReactionJournal {
  _ReceiptJournal(_LifecycleBox box) : super(openBox: () async => box);
  final confirmations = <({String key, String opId})>[];

  @override
  Future<bool> confirm(String key, {required String opId}) {
    confirmations.add((key: key, opId: opId));
    return super.confirm(key, opId: opId);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(registerActionOperationFallbacks);
  final key = AssistantReactionJournal.keyFor(
    actionActor,
    actionWorkspace,
    actionChat,
    actionMessage,
  );

  Future<AssistantChatCubit> open(ActionsRepository repository) async {
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
    await cubit.openChatById(actionWorkspace, actionChat);
    return cubit;
  }

  for (final stage in ['recorded write', 'credential preparation']) {
    test(
      'scope switch during $stage removes unsent marker with zero PUT',
      () async {
        final box = _LifecycleBox();
        final api = ActionsApi();
        final repository = ActionsRepository(
          api,
          reactionJournal: AssistantReactionJournal(openBox: () async => box),
        );
        final cubit = await open(repository);
        final preparing = Completer<void>();
        final credentials = Completer<void>();
        var posts = 0;
        when(
          () => api.putJsonOperationAcknowledged(
            any(),
            any(),
            admission: any(named: 'admission'),
            onAcknowledged: any(named: 'onAcknowledged'),
          ),
        ).thenAnswer(
          (call) => acknowledgeActionOperation(
            call,
            (body) async {
              posts++;
              return actionOperationReceipt(body);
            },
            prepare: (_) async {
              preparing.complete();
              await credentials.future;
            },
          ),
        );
        if (stage == 'credential preparation') box.putRelease.complete();
        final pending = cubit.toggleReaction(actionMessage, 'heart');
        if (stage == 'recorded write') {
          await box.putEntered.future;
        } else {
          await preparing.future;
          expect(box.containsKey(key), isTrue);
        }
        await cubit.openChatById(actionOther, actionOther);
        final stateAfterNavigation = cubit.state;
        final publications = repository.snapshots.length;
        if (stage == 'recorded write') box.putRelease.complete();
        credentials.complete();
        expect(await pending, AssistantReactionResult.stale);
        expect(posts, 0);
        expect(box.containsKey(key), isFalse);
        expect(cubit.state, stateAfterNavigation);
        expect(repository.snapshots.length, publications);
        expect(cubit.needsReactionRefresh(actionMessage), isFalse);
        if (stage == 'recorded write') verifyZeroInteractions(api);
      },
    );
  }

  test(
    'store-open failure adds no uncertainty and later tap can succeed',
    () async {
      final box = _LifecycleBox()..putRelease.complete();
      var opens = 0;
      final journal = AssistantReactionJournal(
        openBox: () async {
          if (++opens == 1) throw StateError('Storage temporarily unavailable');
          return box;
        },
      );
      final api = ActionsApi();
      final cubit = await open(
        ActionsRepository(api, reactionJournal: journal),
      );
      var posts = 0;
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) async {
          posts++;
          return actionOperationReceipt(body);
        }),
      );
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unavailable,
      );
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      expect(cubit.state.messages.single.reactionRefreshRequired, isFalse);
      expect(box.markers, isEmpty);
      expect(posts, 0);
      verifyZeroInteractions(api);
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.updated,
      );
      expect(posts, 1);
      expect(box.markers, isEmpty);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      expect(cubit.state.messages.single.reactions.single.count, 1);
    },
  );

  test(
    'cancelled replay preserves prior unknown intent for later reconciliation',
    () async {
      final box = _LifecycleBox()..putRelease.complete();
      final journal = AssistantReactionJournal(openBox: () async => box);
      expect(
        await journal.begin(key, intent: actionIntent, isCurrent: () => true),
        AssistantReactionBegin.recorded,
      );
      final api = ActionsApi();
      final cubit = await open(
        ActionsRepository(api, reactionJournal: journal),
      );
      final preparing = Completer<void>();
      final credentials = Completer<void>();
      var dispatches = 0;
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(
          call,
          (body) async {
            dispatches++;
            return actionOperationReceipt(body);
          },
          prepare: (_) async {
            expect(call.positionalArguments[1], {
              'messageId': actionMessage,
              ...actionIntent.toJson(),
            });
            preparing.complete();
            await credentials.future;
          },
        ),
      );
      final pending = cubit.refreshReactions(actionMessage);
      await preparing.future;
      await cubit.openChatById(actionOther, actionOther);
      final nextState = cubit.state;
      credentials.complete();
      expect(await pending, AssistantReactionResult.stale);
      expect(dispatches, 0);
      expect(box.get(key), actionIntent.toJson());
      expect(cubit.state, nextState);
      verifyNever(() => api.getJson(any()));
      await cubit.openChatById(actionWorkspace, actionChat);
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) async {
          expect(body, {'messageId': actionMessage, ...actionIntent.toJson()});
          dispatches++;
          return actionOperationReceipt(body);
        }),
      );
      when(() => api.getJson(any())).thenAnswer((call) async {
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
      expect(dispatches, 1);
      expect(box.containsKey(key), isFalse);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
    },
  );

  test('late successful retired receipt cleans origin without publishing '
      'while auth actor is unchanged', () async {
    final box = _LifecycleBox()..putRelease.complete();
    final journal = _ReceiptJournal(box);
    final api = ActionsApi();
    final repository = ActionsRepository(api, reactionJournal: journal);
    final cubit = await open(repository);
    final dispatched = Completer<Map<String, dynamic>>();
    final response = Completer<Map<String, dynamic>>();
    when(
      () => api.putJsonOperationAcknowledged(
        any(),
        any(),
        admission: any(named: 'admission'),
        onAcknowledged: any(named: 'onAcknowledged'),
      ),
    ).thenAnswer(
      (call) => acknowledgeActionOperation(call, (body) {
        dispatched.complete(Map<String, dynamic>.of(body));
        return response.future;
      }),
    );
    final pending = cubit.toggleReaction(actionMessage, 'heart');
    final original = await dispatched.future;
    expect(original['present'], isTrue);
    final opId = original['opId'] as String;
    expect((box.get(key) as Map)['opId'], opId);
    final epoch = repository.reactionActorEpoch;
    final clearing = journal.clearActor(actionActor);
    expect(repository.reactionActorEpoch, epoch + 1);
    expect(repository.currentActorId, actionActor);
    expect(await clearing, isTrue);
    expect(await journal.retirementIds(actionActor), [opId]);
    final currentState = cubit.state;
    final publications = repository.snapshots.length;
    final receipt = actionOperationReceipt(
      original,
      message: {...actionReceipt(), 'reactions': <Map<String, dynamic>>[]},
    );
    expect(receipt['operation'], {
      'id': opId,
      'emoji': 'heart',
      'present': true,
    });
    response.complete(receipt);
    expect(await pending, AssistantReactionResult.stale);
    expect(journal.confirmations, [(key: key, opId: opId)]);
    expect(box.containsKey(key), isFalse);
    expect(await journal.retirementIds(actionActor), [opId]);
    expect(repository.currentActorId, actionActor);
    expect(identical(cubit.state, currentState), isTrue);
    expect(cubit.state.messages.single.reactions, isEmpty);
    expect(repository.snapshots.length, publications);
    verify(
      () => api.putJsonOperationAcknowledged(
        any(),
        any(),
        admission: any(named: 'admission'),
        onAcknowledged: any(named: 'onAcknowledged'),
      ),
    ).called(1);
  });

  test(
    'late timed-out receipt cannot erase successor operation marker',
    () async {
      final box = _LifecycleBox()..putRelease.complete();
      final api = ActionsApi();
      final cubit = await open(
        ActionsRepository(
          api,
          reactionJournal: AssistantReactionJournal(openBox: () async => box),
        ),
      );
      final originalResponse = Completer<Map<String, dynamic>>();
      final originalAcknowledged = Completer<void>();
      final successorResponse = Completer<Map<String, dynamic>>();
      final successorDispatched = Completer<Map<String, dynamic>>();
      final requests = <Map<String, dynamic>>[];
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer((call) {
        final index = requests.length;
        final operation = acknowledgeActionOperation(call, (body) {
          requests.add(Map<String, dynamic>.of(body));
          if (index == 0) return originalResponse.future;
          if (index == 1) return Future.value(actionOperationReceipt(body));
          successorDispatched.complete(body);
          return successorResponse.future;
        });
        if (index != 0) return operation;
        unawaited(operation.then((_) => originalAcknowledged.complete()));
        return operation.timeout(Duration.zero);
      });
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unknown,
      );
      when(
        () => api.getJson(any()),
      ).thenAnswer((_) async => {'message': actionReceipt()});
      expect(
        await cubit.refreshReactions(actionMessage),
        AssistantReactionResult.updated,
      );
      expect(requests[1], requests[0]);
      final successor = cubit.toggleReaction(actionMessage, 'heart');
      final successorBody = await successorDispatched.future;
      expect(successorBody['present'], isFalse);
      expect(successorBody['opId'], isNot(requests[0]['opId']));
      final marker = Map<dynamic, dynamic>.of(box.get(key) as Map);
      expect(marker['opId'], successorBody['opId']);
      final stateWithSuccessor = cubit.state;
      originalResponse.complete(actionOperationReceipt(requests[0]));
      await originalAcknowledged.future;
      expect(box.get(key), marker);
      expect(cubit.state, stateWithSuccessor);
      expect(cubit.needsReactionRefresh(actionMessage), isTrue);
      successorResponse.complete(
        actionOperationReceipt(
          successorBody,
          message: {...actionReceipt(), 'reactions': <Map<String, dynamic>>[]},
        ),
      );
      expect(await successor, AssistantReactionResult.updated);
      expect(box.containsKey(key), isFalse);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      expect(cubit.state.messages.single.reactions, isEmpty);
      expect(requests, hasLength(3));
    },
  );

  test(
    'mismatched operation receipt cannot confirm the pending origin',
    () async {
      final box = _LifecycleBox()..putRelease.complete();
      final api = ActionsApi();
      final cubit = await open(
        ActionsRepository(
          api,
          reactionJournal: AssistantReactionJournal(openBox: () async => box),
        ),
      );
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(
          call,
          (body) async => {
            'message': actionReceipt(),
            'operation': {
              'id': actionSuccessorOp,
              'emoji': 'heart',
              'present': true,
            },
          },
        ),
      );
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unknown,
      );
      expect(box.containsKey(key), isTrue);
      expect(cubit.needsReactionRefresh(actionMessage), isTrue);
      expect(cubit.state.messages.single.reactions, isEmpty);
    },
  );
}
