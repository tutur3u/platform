import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mocktail/mocktail.dart';

import '../cubit/assistant_chat_persistence_actions_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(registerActionOperationFallbacks);
  late Directory directory;
  late Box<dynamic> box;
  late AssistantReactionJournal journal;
  late ActionsApi api;
  late ActionsRepository repository;
  var sequence = 0;
  final key = AssistantReactionJournal.keyFor(
    actionActor,
    actionWorkspace,
    actionChat,
    actionMessage,
  );

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('reaction-retirement-');
    box = await Hive.openBox<dynamic>(
      'retirement_${sequence++}',
      path: directory.path,
      crashRecovery: false,
    );
    journal = AssistantReactionJournal(openBox: () async => box);
    api = ActionsApi();
    repository = ActionsRepository(api, reactionJournal: journal);
  });
  tearDown(() async {
    await repository.frames.close();
    await box.close();
    await directory.delete(recursive: true);
  });

  Future<void> retireLocalIntent() async {
    expect(
      await journal.begin(key, intent: actionIntent, isCurrent: () => true),
      AssistantReactionBegin.recorded,
    );
    expect(await journal.clearActor(actionActor), isTrue);
    expect(box.containsKey(key), isFalse);
    expect(await journal.retirementIds(actionActor), [actionOp]);
  }

  Future<AssistantChatCubit> open() async {
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
      if (!cubit.isClosed) await cubit.close();
    });
    await cubit.openChatById(actionWorkspace, actionChat);
    return cubit;
  }

  test(
    'fresh reaction waits for exact actor retirement acknowledgement',
    () async {
      await retireLocalIntent();
      final otherKey = AssistantReactionJournal.keyFor(
        actionOther,
        actionWorkspace,
        actionChat,
        actionMessage,
      );
      expect(
        await journal.begin(
          otherKey,
          intent: actionIntent,
          isCurrent: () => true,
        ),
        AssistantReactionBegin.recorded,
      );
      final entered = Completer<void>();
      final acknowledgement = Completer<Map<String, dynamic>>();
      final events = <String>[];
      when(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((call) async {
        expect(
          call.positionalArguments[0],
          '/api/v1/workspaces/$actionWorkspace/chat/reactions/retire',
        );
        expect(call.positionalArguments[1], {
          'opIds': [actionOp],
        });
        expect(call.namedArguments[#actorId], actionActor);
        expect((call.namedArguments[#isCurrent] as bool Function())(), isTrue);
        events.add('retire');
        entered.complete();
        final receipt = await acknowledgement.future;
        events.add('acknowledged');
        return receipt;
      });
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) async {
          events.add('put');
          expect(await journal.retirementIds(actionActor), isEmpty);
          expect((box.get(key) as Map)['opId'], body['opId']);
          expect(body['opId'], isNot(actionOp));
          expect(body['present'], isTrue);
          return actionOperationReceipt(body);
        }),
      );
      final cubit = await open();
      final pending = cubit.toggleReaction(actionMessage, 'heart');
      await entered.future;
      expect(box.containsKey(key), isFalse);
      expect(await journal.retirementIds(actionActor), [actionOp]);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      verifyNever(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      );
      acknowledgement.complete({
        'retiredOpIds': [actionOp],
      });
      expect(await pending, AssistantReactionResult.updated);
      expect(events, ['retire', 'acknowledged', 'put']);
      expect(await journal.retirementIds(actionActor), isEmpty);
      expect(box.get(otherKey), actionIntent.toJson());
      expect(cubit.state.messages.single.reactions.single.count, 1);
    },
  );

  test('direct repository begin cannot record before retirement ACK', () async {
    await retireLocalIntent();
    final acknowledgement = Completer<Map<String, dynamic>>();
    var retirements = 0;
    when(
      () => api.postJsonAcknowledged(
        any(),
        any(),
        actorId: any(named: 'actorId'),
        isCurrent: any(named: 'isCurrent'),
      ),
    ).thenAnswer((call) {
      retirements++;
      expect(call.namedArguments[#actorId], actionActor);
      expect(call.positionalArguments[1], {
        'opIds': [actionOp],
      });
      return acknowledgement.future;
    });
    const successor = AssistantReactionIntent(
      opId: actionSuccessorOp,
      emoji: 'heart',
      present: false,
    );
    final pending = repository.beginMessageReaction(
      wsId: actionWorkspace,
      chatId: actionChat,
      messageId: actionMessage,
      intent: successor,
      isCurrent: () => true,
    );
    await Future<void>.delayed(Duration.zero);
    expect(retirements, 1);
    expect(box.containsKey(key), isFalse);
    expect(await journal.retirementIds(actionActor), [actionOp]);
    acknowledgement.complete({
      'retiredOpIds': [actionOp],
    });
    expect(await pending, AssistantReactionBegin.recorded);
    expect(box.get(key), successor.toJson());
    expect(await journal.retirementIds(actionActor), isEmpty);
  });

  for (final receipt in <Map<String, dynamic>>[
    {},
    {'retiredOpIds': <String>[]},
    {
      'retiredOpIds': [actionSuccessorOp],
    },
    {
      'retiredOpIds': [actionOp, actionOp],
    },
  ]) {
    test('retirement receipt $receipt cannot release the fence', () async {
      await retireLocalIntent();
      when(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((_) async => receipt);
      await expectLater(
        repository.prepareMessageReactions(
          wsId: actionWorkspace,
          isCurrent: () => true,
        ),
        throwsFormatException,
      );
      expect(await journal.retirementIds(actionActor), [actionOp]);
      expect(box.containsKey(key), isFalse);
      verifyNever(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      );
    });
  }

  test(
    'retirement is bounded to ten batches of one hundred per preparation',
    () async {
      final memory = ActionsReactionJournal();
      memory.retirements[actionActor] = List.generate(
        1001,
        (i) => 'bbbbbbbb-bbbb-4bbb-8bbb-${i.toString().padLeft(12, '0')}',
      );
      final owner = ActionsRepository(api, reactionJournal: memory);
      addTearDown(owner.frames.close);
      var requests = 0;
      when(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((call) async {
        requests++;
        expect(call.namedArguments[#actorId], actionActor);
        final ids = ((call.positionalArguments[1] as Map)['opIds'] as List)
            .cast<String>();
        expect(ids.length, lessThanOrEqualTo(100));
        return {'retiredOpIds': ids};
      });
      await expectLater(
        owner.prepareMessageReactions(
          wsId: actionWorkspace,
          isCurrent: () => true,
        ),
        throwsFormatException,
      );
      expect(requests, 10);
      expect(await memory.retirementIds(actionActor), hasLength(1));
      await owner.prepareMessageReactions(
        wsId: actionWorkspace,
        isCurrent: () => true,
      );
      expect(requests, 11);
      expect(await memory.retirementIds(actionActor), isEmpty);
    },
  );

  test(
    'clear fences held credentials while auth actor is still unchanged',
    () async {
      expect(
        await journal.begin(key, intent: actionIntent, isCurrent: () => true),
        AssistantReactionBegin.recorded,
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
            preparing.complete();
            await credentials.future;
          },
        ),
      );
      final pending = repository.setMessageReaction(
        actorId: actionActor,
        wsId: actionWorkspace,
        chatId: actionChat,
        messageId: actionMessage,
        intent: actionIntent,
        clearIfNotDispatched: true,
        isCurrent: () => true,
      );
      final observed = expectLater(
        pending,
        throwsA(isA<ApiMutationNotDispatched>()),
      );
      await preparing.future;
      final epoch = AssistantReactionJournal.actorEpoch(actionActor);
      final clearing = journal.clearActor(actionActor);
      expect(AssistantReactionJournal.actorEpoch(actionActor), epoch + 1);
      expect(repository.currentActorId, actionActor);
      expect(await clearing, isTrue);
      credentials.complete();
      await observed;
      expect(dispatches, 0);
      expect(repository.currentActorId, actionActor);
      expect(box.containsKey(key), isFalse);
      expect(await journal.retirementIds(actionActor), [actionOp]);
    },
  );

  for (final successfulRetiredReceipt in [false, true]) {
    test('retired unknown A cannot apply after relogin add then remove '
        '(successful receipt=$successfulRetiredReceipt)', () async {
      final oldCommit = Completer<void>();
      final oldCompleted = Completer<void>();
      final retired = <(String, String)>{};
      final applied = <String, bool>{};
      final requests = <Map<String, dynamic>>[];
      var present = false;
      String? oldId;
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer((call) {
        final first = requests.isEmpty;
        final operation = acknowledgeActionOperation(call, (body) async {
          final id = body['opId'] as String;
          final admission =
              call.namedArguments[#admission] as ApiMutationAdmission;
          requests.add(Map<String, dynamic>.of(body));
          if (first) {
            oldId = id;
            await oldCommit.future;
          }
          if (retired.contains((admission.actorId, id))) {
            if (successfulRetiredReceipt) {
              expect(present, isFalse);
              expect(body['present'], isTrue);
              return actionOperationReceipt(
                body,
                message: {
                  ...actionReceipt(),
                  'reactions': <Map<String, dynamic>>[],
                },
              );
            }
            throw const ApiException(
              message: 'Operation retired',
              statusCode: 409,
            );
          }
          if (!applied.containsKey(id)) {
            present = body['present'] as bool;
            applied[id] = present;
          }
          return actionOperationReceipt(
            body,
            message: {
              ...actionReceipt(),
              if (!present) 'reactions': <Map<String, dynamic>>[],
            },
          );
        });
        if (!first) return operation;
        unawaited(
          operation.then<void>(
            (receipt) {
              expect(successfulRetiredReceipt, isTrue);
              expect(receipt['operation'], {
                'id': oldId,
                'emoji': 'heart',
                'present': true,
              });
              expect((receipt['message'] as Map)['reactions'], isEmpty);
              oldCompleted.complete();
            },
            onError: (Object error, StackTrace _) {
              expect(successfulRetiredReceipt, isFalse);
              expect(
                error,
                isA<ApiException>().having(
                  (e) => e.statusCode,
                  'retired operation',
                  409,
                ),
              );
              oldCompleted.complete();
            },
          ),
        );
        return operation.timeout(Duration.zero);
      });
      final first = await open();
      expect(
        await first.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unknown,
      );
      expect(oldId, isNotNull);
      expect(applied, isEmpty);
      expect(await journal.clearActor(actionActor), isTrue);
      expect(await journal.retirementIds(actionActor), [oldId]);
      expect(box.containsKey(key), isFalse);
      await first.close();
      final retirementEntered = Completer<void>();
      final retirementAck = Completer<void>();
      when(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((call) async {
        expect(
          call.positionalArguments[0],
          '/api/v1/workspaces/$actionWorkspace/chat/reactions/retire',
        );
        expect(call.namedArguments[#actorId], actionActor);
        expect(call.positionalArguments[1], {
          'opIds': [oldId],
        });
        retirementEntered.complete();
        await retirementAck.future;
        // Model the server transaction: install tombstones before admitting B.
        retired.add((actionActor, oldId!));
        return {
          'retiredOpIds': [oldId],
        };
      });
      final next = await open();
      final add = next.toggleReaction(actionMessage, 'heart');
      await retirementEntered.future;
      expect(requests, hasLength(1));
      expect(applied, isEmpty);
      retirementAck.complete();
      expect(await add, AssistantReactionResult.updated);
      expect(present, isTrue);
      expect(
        await next.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.updated,
      );
      expect(present, isFalse);
      expect(requests, hasLength(3));
      expect(requests.map((body) => body['opId']).toSet(), hasLength(3));
      expect(requests.map((body) => body['present']), [true, true, false]);
      final currentState = next.state;
      final publications = repository.snapshots.length;
      oldCommit.complete();
      await oldCompleted.future;
      expect(present, isFalse);
      expect(applied.keys, isNot(contains(oldId)));
      expect(applied.values, [true, false]);
      expect(next.state, currentState);
      expect(repository.snapshots.length, publications);
      expect(next.state.messages.single.reactions, isEmpty);
      expect(await journal.retirementIds(actionActor), isEmpty);
      expect(box.containsKey(key), isFalse);
    });
  }
}
