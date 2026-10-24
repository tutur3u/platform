import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mocktail/mocktail.dart';

import '../cubit/assistant_chat_persistence_actions_harness.dart';

class _HeldFlushBox extends Mock implements Box<dynamic> {
  final markers = <dynamic, dynamic>{};
  final List<Completer<void>> flushEntered = List.generate(
    4,
    (_) => Completer<void>(),
  );
  final List<Completer<void>> flushResults = List.generate(
    4,
    (_) => Completer<void>(),
  );
  int puts = 0;
  int flushes = 0;
  @override
  Iterable<dynamic> get keys => markers.keys;
  @override
  bool containsKey(dynamic key) => markers.containsKey(key);
  @override
  dynamic get(dynamic key, {dynamic defaultValue}) =>
      markers.containsKey(key) ? markers[key] : defaultValue;
  @override
  Future<void> put(dynamic key, dynamic value) async {
    puts++;
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
  Future<void> flush() {
    final index = flushes++;
    flushEntered[index].complete();
    return flushResults[index].future;
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

  for (final succeeds in [true, false]) {
    test(
      'visible put cannot admit before durable flush (success=$succeeds)',
      () async {
        final box = _HeldFlushBox();
        final journal = AssistantReactionJournal(openBox: () async => box);
        var settled = false;
        final pending = journal.begin(
          key,
          intent: actionIntent,
          isCurrent: () => true,
        );
        unawaited(pending.then((_) => settled = true));
        await box.flushEntered[0].future;
        expect(box.puts, 1);
        expect(box.get(key), actionIntent.toJson());
        expect(settled, isFalse);
        if (succeeds) {
          box.flushResults[0].complete();
        } else {
          box.flushResults[0].completeError(StateError('Disk flush failed'));
          await box.flushEntered[1].future;
          expect(box.containsKey(key), isFalse);
          expect(settled, isFalse);
          box.flushResults[1].complete();
        }
        expect(
          await pending,
          succeeds
              ? AssistantReactionBegin.recorded
              : AssistantReactionBegin.failed,
        );
        expect(box.containsKey(key), succeeds);
        expect(box.puts, 1);
        expect(box.flushes, succeeds ? 1 : 2);
        if (succeeds) {
          expect(
            await journal.begin(
              key,
              intent: actionIntent,
              isCurrent: () => true,
            ),
            AssistantReactionBegin.alreadyPending,
          );
        }
      },
    );

    test(
      'visible delete cannot confirm before flush (success=$succeeds)',
      () async {
        final box = _HeldFlushBox()..markers[key] = actionIntent.toJson();
        final journal = AssistantReactionJournal(openBox: () async => box);
        var settled = false;
        final pending = journal.confirm(key, opId: actionOp);
        unawaited(pending.then((_) => settled = true));
        await box.flushEntered[0].future;
        expect(box.containsKey(key), isFalse);
        expect(settled, isFalse);
        if (succeeds) {
          box.flushResults[0].complete();
        } else {
          box.flushResults[0].completeError(StateError('Delete flush failed'));
        }
        expect(await pending, succeeds);
        expect(box.flushes, 1);
      },
    );
  }

  test(
    'concurrent begins serialize across instances while flush is held',
    () async {
      final box = _HeldFlushBox();
      var opens = 0;
      Future<Box<dynamic>> openBox() async {
        opens++;
        return box;
      }

      final first = AssistantReactionJournal(
        openBox: openBox,
      ).begin(key, intent: actionIntent, isCurrent: () => true);
      await box.flushEntered[0].future;
      var secondSettled = false;
      const successor = AssistantReactionIntent(
        opId: actionSuccessorOp,
        emoji: 'heart',
        present: false,
      );
      final second = AssistantReactionJournal(
        openBox: openBox,
      ).begin(key, intent: successor, isCurrent: () => true);
      unawaited(second.then((_) => secondSettled = true));
      await Future<void>.delayed(Duration.zero);
      expect(secondSettled, isFalse);
      expect(opens, 1);
      expect(box.puts, 1);
      box.flushResults[0].complete();
      expect(await first, AssistantReactionBegin.recorded);
      expect(await second, AssistantReactionBegin.alreadyPending);
      expect(box.get(key), actionIntent.toJson());
      expect(opens, 2);
      expect(box.puts, 1);
      expect(box.flushes, 1);
    },
  );

  test(
    'scope retirement during flush removes definitely unsent marker',
    () async {
      final box = _HeldFlushBox();
      final journal = AssistantReactionJournal(openBox: () async => box);
      var current = true;
      final pending = journal.begin(
        key,
        intent: actionIntent,
        isCurrent: () => current,
      );
      await box.flushEntered[0].future;
      current = false;
      box.flushResults[0].complete();
      await box.flushEntered[1].future;
      expect(box.containsKey(key), isFalse);
      box.flushResults[1].complete();
      expect(await pending, AssistantReactionBegin.failed);
      expect(await journal.pending(key), isNull);
    },
  );

  test(
    'actor signout fences held and queued writes while preserving other actor',
    () async {
      final otherKey = AssistantReactionJournal.keyFor(
        actionOther,
        actionWorkspace,
        actionChat,
        actionMessage,
      );
      final queuedKey = AssistantReactionJournal.keyFor(
        actionActor,
        actionWorkspace,
        actionChat,
        actionOther,
      );
      final box = _HeldFlushBox()..markers[otherKey] = actionIntent.toJson();
      final journal = AssistantReactionJournal(openBox: () async => box);
      final held = journal.begin(
        key,
        intent: actionIntent,
        isCurrent: () => true,
      );
      await box.flushEntered[0].future;
      final queued = journal.begin(
        queuedKey,
        intent: actionIntent,
        isCurrent: () => true,
      );
      final clear = journal.clearActor(actionActor);
      box.flushResults[0].complete();
      await box.flushEntered[1].future;
      box.flushResults[1].complete();
      expect(await held, AssistantReactionBegin.failed);
      expect(await queued, AssistantReactionBegin.failed);
      await box.flushEntered[2].future;
      box.flushResults[2].complete();
      expect(await clear, isTrue);
      expect(box.markers, {otherKey: actionIntent.toJson()});
      expect(box.puts, 1);
    },
  );

  test(
    'signout flushes minimal retirement fence before deleting actor metadata',
    () async {
      final box = _HeldFlushBox()..markers[key] = actionIntent.toJson();
      final journal = AssistantReactionJournal(openBox: () async => box);
      var settled = false;
      final epoch = AssistantReactionJournal.actorEpoch(actionActor);
      final clearing = journal.clearActor(actionActor);
      unawaited(clearing.then((_) => settled = true));
      expect(AssistantReactionJournal.actorEpoch(actionActor), epoch + 1);
      await box.flushEntered[0].future;
      final retirementKey = box.markers.keys
          .where((key) => '$key'.startsWith('retired::'))
          .single;
      expect(retirementKey, matches(r'^retired::[a-f0-9]{64}$'));
      expect(box.markers[retirementKey], [actionOp]);
      expect(box.get(key), actionIntent.toJson());
      expect(settled, isFalse);
      box.flushResults[0].complete();
      await box.flushEntered[1].future;
      expect(box.containsKey(key), isFalse);
      expect(box.markers, {
        retirementKey: [actionOp],
      });
      expect(settled, isFalse);
      box.flushResults[1].complete();
      expect(await clearing, isTrue);
      expect(await journal.retirementIds(actionActor), [actionOp]);
    },
  );

  test(
    'failed retirement fence flush preserves intent until durable retry',
    () async {
      final box = _HeldFlushBox()..markers[key] = actionIntent.toJson();
      final journal = AssistantReactionJournal(openBox: () async => box);
      final clearing = journal.clearActor(actionActor);
      await box.flushEntered[0].future;
      box.flushResults[0].completeError(StateError('Fence flush failed'));
      expect(await clearing, isFalse);
      expect(box.get(key), actionIntent.toJson());
      expect(box.flushes, 1);
      final retry = journal.clearActor(actionActor);
      await box.flushEntered[1].future;
      expect(box.get(key), actionIntent.toJson());
      box.flushResults[1].complete();
      await box.flushEntered[2].future;
      expect(box.containsKey(key), isFalse);
      box.flushResults[2].complete();
      expect(await retry, isTrue);
      expect(await journal.retirementIds(actionActor), [actionOp]);
    },
  );

  for (final succeeds in [true, false]) {
    test('Cubit cannot PUT before put and flush (success=$succeeds)', () async {
      final box = _HeldFlushBox();
      final journal = AssistantReactionJournal(openBox: () async => box);
      final api = ActionsApi();
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
      await cubit.openChatById(actionWorkspace, actionChat);
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
          expect(box.flushResults[0].isCompleted, isTrue);
          expect(
            call.positionalArguments[0],
            '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
            '$actionChat/reactions',
          );
          expect(body, {
            'messageId': actionMessage,
            'emoji': 'heart',
            'present': true,
            'opId': (box.get(key) as Map)['opId'],
          });
          posts++;
          return actionOperationReceipt(body);
        }),
      );
      var settled = false;
      final pending = cubit.toggleReaction(actionMessage, 'heart');
      unawaited(pending.then((_) => settled = true));
      await box.flushEntered[0].future;
      expect(box.get(key), {
        'opId': isA<String>().having(isUuid, 'valid operation UUID', isTrue),
        'emoji': 'heart',
        'present': true,
      });
      expect(posts, 0);
      expect(settled, isFalse);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      verifyZeroInteractions(api);
      if (succeeds) {
        box.flushResults[0].complete();
      } else {
        box.flushResults[0].completeError(StateError('Disk flush failed'));
      }
      await box.flushEntered[1].future;
      expect(posts, succeeds ? 1 : 0);
      expect(box.containsKey(key), isFalse);
      expect(settled, isFalse);
      expect(cubit.needsReactionRefresh(actionMessage), succeeds);
      box.flushResults[1].complete();
      expect(
        await pending,
        succeeds
            ? AssistantReactionResult.updated
            : AssistantReactionResult.unavailable,
      );
      expect(posts, succeeds ? 1 : 0);
      expect(box.flushes, 2);
      expect(cubit.needsReactionRefresh(actionMessage), isFalse);
      if (!succeeds) verifyZeroInteractions(api);
      verifyNever(() => api.postJson(any(), any()));
    });
  }
}
