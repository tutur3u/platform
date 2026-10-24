import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mocktail/mocktail.dart';

import 'assistant_chat_persistence_actions_harness.dart';

class _HeldJournal extends AssistantReactionJournal {
  final beginEntered = Completer<String>();
  final beginResult = Completer<bool>();
  final confirmEntered = Completer<String>();
  final confirmResult = Completer<bool>();

  @override
  Future<bool> begin(String key, {required bool Function() isCurrent}) {
    expect(isCurrent(), isTrue);
    beginEntered.complete(key);
    return beginResult.future;
  }

  @override
  Future<bool> confirm(String key, {required bool Function() isCurrent}) {
    expect(isCurrent(), isTrue);
    confirmEntered.complete(key);
    return confirmResult.future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => registerFallbackValue(() => true));
  late Directory journalDirectory;
  late Box<dynamic> box;
  var sequence = 0;
  setUp(() async {
    journalDirectory = await Directory.systemTemp.createTemp('mira-journal-');
    box = await Hive.openBox<dynamic>(
      'review_${sequence++}',
      path: journalDirectory.path,
    );
  });
  tearDown(() async {
    await box.close();
    await journalDirectory.delete(recursive: true);
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
    test('credential preparation respects parent mode revision '
        '(remote-local-remote=$changeMode)', () async {
      final api = ActionsApi();
      final repository = ActionsRepository(api, reactionJournal: journal());
      final cubit = await open(repository);
      final preparing = Completer<void>();
      final releaseCredentials = Completer<void>();
      bool Function()? transportCurrent;
      var simulatedPosts = 0;
      var mode = 'remote';
      var revision = 0;
      final selectedRevision = revision;
      bool parentCurrent() => mode == 'remote' && revision == selectedRevision;
      when(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((call) async {
        expect(call.namedArguments[#actorId], actionActor);
        expect(
          call.positionalArguments[0],
          '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
          '$actionChat/reactions',
        );
        expect(call.positionalArguments[1], {
          'messageId': actionMessage,
          'emoji': 'heart',
        });
        final current = call.namedArguments[#isCurrent] as bool Function();
        transportCurrent = current;
        expect(current(), isTrue);
        preparing.complete();
        await releaseCredentials.future;
        if (!current()) throw const AssistantChatCacheCancellation();
        simulatedPosts++;
        return {'message': actionReceipt()};
      });

      final pending = cubit.toggleReaction(
        actionMessage,
        'heart',
        isCurrent: parentCurrent,
      );
      await preparing.future;
      expect(simulatedPosts, 0);
      if (changeMode) {
        mode = 'local';
        revision++;
        mode = 'remote';
        revision++;
        // No lease observation occurs between the two mode selections.
        expect(mode, 'remote');
        expect(parentCurrent(), isFalse);
        expect(transportCurrent!(), isFalse);
      }
      releaseCredentials.complete();
      expect(
        await pending,
        changeMode
            ? AssistantReactionResult.stale
            : AssistantReactionResult.updated,
      );
      expect(simulatedPosts, changeMode ? 0 : 1);
      expect(cubit.needsReactionRefresh(actionMessage), changeMode);
      final marker = AssistantReactionJournal.keyFor(
        actionActor,
        actionWorkspace,
        actionChat,
        actionMessage,
      );
      expect(box.containsKey(marker), changeMode);
      verifyNever(() => api.postJson(any(), any()));
    });
  }

  for (final persisted in [false, true]) {
    test(
      'journal begin must finish successfully before API (success=$persisted)',
      () async {
        final api = ActionsApi();
        final journal = _HeldJournal();
        final cubit = await open(
          ActionsRepository(api, reactionJournal: journal),
        );
        var posts = 0;
        when(
          () => api.postJsonAcknowledged(
            any(),
            any(),
            actorId: any(named: 'actorId'),
            isCurrent: any(named: 'isCurrent'),
          ),
        ).thenAnswer((_) async {
          expect(journal.beginResult.isCompleted, isTrue);
          posts++;
          return {'message': actionReceipt()};
        });

        var settled = false;
        final pending = cubit.toggleReaction(actionMessage, 'heart');
        unawaited(pending.then((_) => settled = true));
        final key = await journal.beginEntered.future;
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
        expect(cubit.needsReactionRefresh(actionMessage), isTrue);
        verifyZeroInteractions(api);
        journal.beginResult.complete(persisted);

        if (persisted) {
          expect(await journal.confirmEntered.future, key);
          expect(posts, 1);
          expect(settled, isFalse);
          expect(cubit.needsReactionRefresh(actionMessage), isTrue);
          journal.confirmResult.complete(true);
        }
        expect(
          await pending,
          persisted
              ? AssistantReactionResult.updated
              : AssistantReactionResult.refreshRequired,
        );
        expect(posts, persisted ? 1 : 0);
        expect(cubit.needsReactionRefresh(actionMessage), !persisted);
        if (!persisted) {
          expect(journal.confirmEntered.isCompleted, isFalse);
          verifyZeroInteractions(api);
        }
      },
    );
  }

  test(
    'failed confirmation retains a known receipt fence without replay',
    () async {
      final api = ActionsApi();
      final journal = _HeldJournal();
      final cubit = await open(
        ActionsRepository(api, reactionJournal: journal),
      );
      when(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((_) async => {'message': actionReceipt()});
      final pending = cubit.toggleReaction(actionMessage, 'heart');
      await journal.beginEntered.future;
      journal.beginResult.complete(true);
      await journal.confirmEntered.future;
      journal.confirmResult.complete(false);
      expect(await pending, AssistantReactionResult.refreshRequired);
      expect(cubit.state.messages.single.reactions.single.count, 1);
      expect(cubit.needsReactionRefresh(actionMessage), isTrue);
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      verify(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).called(1);
    },
  );

  test(
    'new repository and fresh unflagged chat cannot erase unknown marker',
    () async {
      final firstApi = ActionsApi();
      final first = await open(
        ActionsRepository(firstApi, reactionJournal: journal()),
      );
      when(
        () => firstApi.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((_) async => throw StateError('Uncertain dispatch'));
      expect(
        await first.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unknown,
      );

      final secondApi = ActionsApi();
      final second = await open(
        ActionsRepository(secondApi, reactionJournal: journal()),
      );
      expect(second.state.messages.single.reactionRefreshRequired, isFalse);
      expect(second.needsReactionRefresh(actionMessage), isFalse);
      expect(
        await second.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.refreshRequired,
      );
      expect(second.needsReactionRefresh(actionMessage), isTrue);
      verifyZeroInteractions(secondApi);
      final key = AssistantReactionJournal.keyFor(
        actionActor,
        actionWorkspace,
        actionChat,
        actionMessage,
      );
      expect(box.get(key), isTrue);
    },
  );
}
