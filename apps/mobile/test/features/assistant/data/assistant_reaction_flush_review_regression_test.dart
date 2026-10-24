import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mocktail/mocktail.dart';

import '../cubit/assistant_chat_persistence_actions_harness.dart';

class _HeldFlushBox extends Mock implements Box<dynamic> {
  final markers = <dynamic, dynamic>{};
  final List<Completer<void>> flushEntered = [
    Completer<void>(),
    Completer<void>(),
  ];
  final List<Completer<void>> flushResults = [
    Completer<void>(),
    Completer<void>(),
  ];
  int puts = 0;
  int flushes = 0;

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
  Future<void> flush() {
    final index = flushes++;
    flushEntered[index].complete();
    return flushResults[index].future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => registerFallbackValue(() => true));
  final key = AssistantReactionJournal.keyFor(
    actionActor,
    actionWorkspace,
    actionChat,
    actionMessage,
  );

  for (final succeeds in [true, false]) {
    test(
      'visible put cannot complete begin before flush (success=$succeeds)',
      () async {
        final box = _HeldFlushBox();
        final journal = AssistantReactionJournal(openBox: () async => box);
        var settled = false;
        final pending = journal.begin(key, isCurrent: () => true);
        unawaited(pending.then((_) => settled = true));
        await box.flushEntered[0].future;
        await Future<void>.delayed(Duration.zero);
        expect(box.puts, 1);
        expect(box.get(key), isTrue);
        expect(settled, isFalse);

        if (succeeds) {
          box.flushResults[0].complete();
        } else {
          box.flushResults[0].completeError(StateError('Disk flush failed'));
        }
        expect(await pending, succeeds);
        expect(box.get(key), isTrue);
        expect(await journal.begin(key, isCurrent: () => true), isFalse);
        expect(box.puts, 1);
        expect(box.flushes, 1);
      },
    );

    test(
      'visible delete cannot confirm before flush (success=$succeeds)',
      () async {
        final box = _HeldFlushBox()..markers[key] = true;
        final journal = AssistantReactionJournal(openBox: () async => box);
        var settled = false;
        final pending = journal.confirm(key, isCurrent: () => true);
        unawaited(pending.then((_) => settled = true));
        await box.flushEntered[0].future;
        await Future<void>.delayed(Duration.zero);
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
      ).begin(key, isCurrent: () => true);
      await box.flushEntered[0].future;
      var secondSettled = false;
      final second = AssistantReactionJournal(
        openBox: openBox,
      ).begin(key, isCurrent: () => true);
      unawaited(second.then((_) => secondSettled = true));
      await Future<void>.delayed(Duration.zero);
      expect(secondSettled, isFalse);
      expect(opens, 1);
      expect(box.puts, 1);
      box.flushResults[0].complete();
      expect(await first, isTrue);
      expect(await second, isFalse);
      expect(opens, 2);
      expect(box.puts, 1);
      expect(box.flushes, 1);
    },
  );

  test('scope retiring during flush cannot authorize a toggle', () async {
    final box = _HeldFlushBox();
    final journal = AssistantReactionJournal(openBox: () async => box);
    var current = true;
    final pending = journal.begin(key, isCurrent: () => current);
    await box.flushEntered[0].future;
    current = false;
    box.flushResults[0].complete();
    expect(await pending, isFalse);
    expect(box.get(key), isTrue);
    expect(await journal.begin(key, isCurrent: () => true), isFalse);
  });

  for (final succeeds in [true, false]) {
    test(
      'Cubit cannot POST a visible marker before flush (success=$succeeds)',
      () async {
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
          () => api.postJsonAcknowledged(
            any(),
            any(),
            actorId: any(named: 'actorId'),
            isCurrent: any(named: 'isCurrent'),
          ),
        ).thenAnswer((call) async {
          expect(box.flushResults[0].isCompleted, isTrue);
          expect(call.namedArguments[#actorId], actionActor);
          expect(
            (call.namedArguments[#isCurrent] as bool Function())(),
            isTrue,
          );
          expect(
            call.positionalArguments[0],
            '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
            '$actionChat/reactions',
          );
          expect(call.positionalArguments[1], {
            'messageId': actionMessage,
            'emoji': 'heart',
          });
          posts++;
          return {'message': actionReceipt()};
        });

        var settled = false;
        final pending = cubit.toggleReaction(actionMessage, 'heart');
        unawaited(pending.then((_) => settled = true));
        await box.flushEntered[0].future;
        await Future<void>.delayed(Duration.zero);
        expect(box.get(key), isTrue);
        expect(posts, 0);
        expect(settled, isFalse);
        expect(cubit.needsReactionRefresh(actionMessage), isTrue);
        verifyZeroInteractions(api);

        if (succeeds) {
          box.flushResults[0].complete();
          await box.flushEntered[1].future;
          await Future<void>.delayed(Duration.zero);
          expect(posts, 1);
          expect(box.containsKey(key), isFalse);
          expect(settled, isFalse);
          expect(cubit.needsReactionRefresh(actionMessage), isTrue);
          box.flushResults[1].complete();
        } else {
          box.flushResults[0].completeError(StateError('Disk flush failed'));
        }
        expect(
          await pending,
          succeeds
              ? AssistantReactionResult.updated
              : AssistantReactionResult.refreshRequired,
        );
        expect(posts, succeeds ? 1 : 0);
        expect(box.flushes, succeeds ? 2 : 1);
        expect(cubit.needsReactionRefresh(actionMessage), !succeeds);
        if (!succeeds) {
          expect(
            await cubit.toggleReaction(actionMessage, 'heart'),
            AssistantReactionResult.refreshRequired,
          );
          verifyZeroInteractions(api);
        } else {
          verify(
            () => api.postJsonAcknowledged(
              any(),
              any(),
              actorId: any(named: 'actorId'),
              isCurrent: any(named: 'isCurrent'),
            ),
          ).called(1);
        }
        verifyNever(() => api.postJson(any(), any()));
      },
    );
  }
}
