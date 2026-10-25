import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mocktail/mocktail.dart';

import 'assistant_chat_persistence_actions_harness.dart';

class _HeldJournal extends ActionsReactionJournal {
  final beginEntered = Completer<String>();
  final beginResult = Completer<AssistantReactionBegin>();
  final confirmEntered = Completer<String>();
  final confirmResult = Completer<bool>();

  @override
  Future<AssistantReactionBegin> begin(
    String key, {
    required AssistantReactionIntent intent,
    required bool Function() isCurrent,
  }) async {
    expect(isCurrent(), isTrue);
    intents[key] = intent;
    beginEntered.complete(key);
    final result = await beginResult.future;
    if (result == AssistantReactionBegin.failed) intents.remove(key);
    return result;
  }

  @override
  Future<bool> confirm(String key, {required String opId}) async {
    expect(intents[key]?.opId, opId);
    if (!confirmEntered.isCompleted) confirmEntered.complete(key);
    final confirmed = await confirmResult.future;
    return confirmed && await super.confirm(key, opId: opId);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(registerActionOperationFallbacks);
  late Directory directory;
  late Box<dynamic> box;
  var sequence = 0;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mira-journal-');
    box = await Hive.openBox<dynamic>(
      'review_${sequence++}',
      path: directory.path,
    );
  });
  tearDown(() async {
    await box.close();
    await directory.delete(recursive: true);
  });
  AssistantReactionJournal journal() =>
      AssistantReactionJournal(openBox: () async => box);

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

  for (final changeMode in [true, false]) {
    test(
      'credential preparation checks mode revision (ABA=$changeMode)',
      () async {
        final api = ActionsApi();
        final cubit = await open(
          ActionsRepository(api, reactionJournal: journal()),
        );
        final preparing = Completer<void>();
        final credentials = Completer<void>();
        ApiMutationAdmission? transportAdmission;
        var posts = 0;
        var mode = 'remote';
        var revision = 0;
        final selectedRevision = revision;
        bool parentCurrent() =>
            mode == 'remote' && revision == selectedRevision;
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
            prepare: (admission) async {
              transportAdmission = admission;
              expect(admission.actorId, actionActor);
              expect(admission.current, isTrue);
              preparing.complete();
              await credentials.future;
            },
          ),
        );
        final pending = cubit.toggleReaction(
          actionMessage,
          'heart',
          isCurrent: parentCurrent,
        );
        await preparing.future;
        expect(posts, 0);
        if (changeMode) {
          mode = 'local';
          revision++;
          mode = 'remote';
          revision++;
          expect(parentCurrent(), isFalse);
          expect(transportAdmission!.current, isFalse);
        }
        credentials.complete();
        expect(
          await pending,
          changeMode
              ? AssistantReactionResult.stale
              : AssistantReactionResult.updated,
        );
        expect(posts, changeMode ? 0 : 1);
        expect(cubit.needsReactionRefresh(actionMessage), changeMode);
        expect(
          box.containsKey(
            AssistantReactionJournal.keyFor(
              actionActor,
              actionWorkspace,
              actionChat,
              actionMessage,
            ),
          ),
          isFalse,
        );
        expect(transportAdmission!.definitelyNotDispatched, changeMode);
        if (changeMode) {
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
          expect(posts, 0);
          expect(cubit.needsReactionRefresh(actionMessage), isFalse);
        }
        verifyNever(() => api.postJson(any(), any()));
      },
    );
  }

  for (final persisted in [false, true]) {
    test(
      'journal admission must settle before PUT (recorded=$persisted)',
      () async {
        final api = ActionsApi();
        final held = _HeldJournal();
        final cubit = await open(ActionsRepository(api, reactionJournal: held));
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
            expect(held.beginResult.isCompleted, isTrue);
            posts++;
            return actionOperationReceipt(body);
          }),
        );
        var settled = false;
        final pending = cubit.toggleReaction(actionMessage, 'heart');
        unawaited(pending.then((_) => settled = true));
        final key = await held.beginEntered.future;
        expect(
          key,
          AssistantReactionJournal.keyFor(
            actionActor,
            actionWorkspace,
            actionChat,
            actionMessage,
          ),
        );
        expect(settled, isFalse);
        expect(cubit.needsReactionRefresh(actionMessage), isFalse);
        verifyZeroInteractions(api);
        held.beginResult.complete(
          persisted
              ? AssistantReactionBegin.recorded
              : AssistantReactionBegin.failed,
        );
        if (persisted) {
          expect(await held.confirmEntered.future, key);
          expect(posts, 1);
          expect(settled, isFalse);
          expect(cubit.needsReactionRefresh(actionMessage), isTrue);
          held.confirmResult.complete(true);
        }
        expect(
          await pending,
          persisted
              ? AssistantReactionResult.updated
              : AssistantReactionResult.unavailable,
        );
        expect(posts, persisted ? 1 : 0);
        expect(cubit.needsReactionRefresh(actionMessage), isFalse);
        if (!persisted) {
          expect(held.confirmEntered.isCompleted, isFalse);
          verifyZeroInteractions(api);
        }
      },
    );
  }

  test(
    'departure before recorded begin returns cleans origin without PUT',
    () async {
      final api = ActionsApi();
      final held = _HeldJournal();
      final repository = ActionsRepository(api, reactionJournal: held);
      final cubit = await open(repository);
      final pending = cubit.toggleReaction(actionMessage, 'heart');
      final key = await held.beginEntered.future;
      final recordedIntent = held.intents[key]!.toJson();
      await cubit.openChatById(actionOther, actionOther);
      final stateAfterNavigation = cubit.state;
      final publications = repository.snapshots.length;
      held.beginResult.complete(AssistantReactionBegin.recorded);
      expect(await held.confirmEntered.future, key);
      expect(held.intents[key]!.toJson(), recordedIntent);
      verifyZeroInteractions(api);
      held.confirmResult.complete(true);
      expect(await pending, AssistantReactionResult.stale);
      expect(held.intents, isEmpty);
      expect(cubit.state, stateAfterNavigation);
      expect(repository.snapshots.length, publications);
      verifyZeroInteractions(api);
    },
  );

  test(
    'failed confirmation stays fenced until same operation replay confirms',
    () async {
      final api = ActionsApi();
      var confirmations = 0;
      final intents = ActionsReactionJournal();
      final held = _RetryConfirmationJournal(
        intents,
        () => ++confirmations > 1,
      );
      final cubit = await open(ActionsRepository(api, reactionJournal: held));
      final bodies = <Map<String, dynamic>>[];
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) async {
          bodies.add(Map<String, dynamic>.of(body));
          return actionOperationReceipt(body);
        }),
      );
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      expect(cubit.state.messages.single.reactions.single.count, 1);
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      expect(bodies, hasLength(1));
      when(
        () => api.getJson(any()),
      ).thenAnswer((_) async => {'message': actionReceipt()});
      expect(
        await cubit.refreshReactions(actionMessage),
        AssistantReactionResult.updated,
      );
      expect(bodies, hasLength(2));
      expect(bodies[1], bodies[0]);
      expect(intents.intents, isEmpty);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
    },
  );

  test(
    'new repository replays durable original before reading old target',
    () async {
      final firstApi = ActionsApi();
      final first = await open(
        ActionsRepository(firstApi, reactionJournal: journal()),
      );
      Map<String, dynamic>? original;
      when(
        () => firstApi.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) async {
          original = Map<String, dynamic>.of(body);
          throw StateError('Uncertain dispatch');
        }),
      );
      expect(
        await first.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unknown,
      );
      final secondApi = ActionsApi();
      final secondRepository =
          ActionsRepository(secondApi, reactionJournal: journal())
            ..rows = [
              // The target precedes more than 100 newer messages.
              actionRow,
              for (var i = 0; i < 101; i++)
                actionRow.copyWith(
                  id:
                      'bbbbbbbb-bbbb-4bbb-8bbb-'
                      '${i.toString().padLeft(12, '0')}',
                ),
            ];
      final second = await open(secondRepository);
      expect(second.needsReactionRefresh(actionMessage), isFalse);
      expect(
        await second.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      verifyZeroInteractions(secondApi);
      final order = <String>[];
      when(
        () => secondApi.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) async {
          order.add('replay');
          expect(body, original);
          return actionOperationReceipt(body);
        }),
      );
      when(() => secondApi.getJson(any())).thenAnswer((call) async {
        order.add('read');
        expect(
          call.positionalArguments.single,
          '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
          '$actionChat/reactions?messageId=$actionMessage',
        );
        return {'message': actionReceipt()};
      });
      expect(
        await second.refreshReactions(actionMessage),
        AssistantReactionResult.updated,
      );
      expect(order, ['replay', 'read']);
      expect(second.needsReactionRefresh(actionMessage), isFalse);
      final target = second.state.messages.firstWhere(
        (m) => m.id == actionMessage,
      );
      expect(target.reactions.single.count, 1);
      expect(second.state.messages, hasLength(102));
      expect(box.keys, isEmpty);
    },
  );
}

class _RetryConfirmationJournal extends AssistantReactionJournal {
  _RetryConfirmationJournal(this.store, this.canConfirm);
  final ActionsReactionJournal store;
  final bool Function() canConfirm;
  @override
  Future<List<String>> retirementIds(String actor) =>
      store.retirementIds(actor);
  @override
  Future<void> finishRetirement(String actor, List<String> opIds) =>
      store.finishRetirement(actor, opIds);
  @override
  Future<AssistantReactionBegin> begin(
    String key, {
    required AssistantReactionIntent intent,
    required bool Function() isCurrent,
  }) => store.begin(key, intent: intent, isCurrent: isCurrent);
  @override
  Future<AssistantReactionIntent?> pending(String key) => store.pending(key);
  @override
  Future<bool> confirm(String key, {required String opId}) async =>
      canConfirm() && await store.confirm(key, opId: opId);
}
