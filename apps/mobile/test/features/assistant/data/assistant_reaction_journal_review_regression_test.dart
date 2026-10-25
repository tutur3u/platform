import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mocktail/mocktail.dart';

import '../cubit/assistant_chat_persistence_actions_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late Box<dynamic> box;
  const boxName = 'reaction_journal_review';
  final key = AssistantReactionJournal.keyFor(
    actionActor,
    actionWorkspace,
    actionChat,
    actionMessage,
  );
  const successor = AssistantReactionIntent(
    opId: actionSuccessorOp,
    emoji: 'heart',
    present: false,
  );
  Future<Box<dynamic>> openBox() => Hive.openBox<dynamic>(
    boxName,
    path: directory.path,
    crashRecovery: false,
  );
  AssistantReactionJournal journal() =>
      AssistantReactionJournal(openBox: () async => box);
  Future<AssistantReactionBegin> begin({
    AssistantReactionIntent intent = actionIntent,
    bool Function()? isCurrent,
  }) =>
      journal().begin(key, intent: intent, isCurrent: isCurrent ?? () => true);

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('reaction-journal-');
    box = await openBox();
  });
  tearDown(() async {
    if (box.isOpen) await box.close();
    await directory.delete(recursive: true);
  });

  test(
    'flushed operation survives reopen and retains desired state and ID',
    () async {
      final api = ActionsApi();
      AssistantRepository repository() => AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        currentUserId: () => actionActor,
        reactionJournal: journal(),
      );
      Future<AssistantReactionBegin> repositoryBegin() =>
          repository().beginMessageReaction(
            wsId: actionWorkspace,
            chatId: actionChat,
            messageId: actionMessage,
            intent: actionIntent,
            isCurrent: () => true,
          );
      expect(await repositoryBegin(), AssistantReactionBegin.recorded);
      await box.close();
      box = await openBox();
      expect(box.get(key), actionIntent.toJson());
      expect(await repositoryBegin(), AssistantReactionBegin.alreadyPending);
      expect(
        await begin(intent: successor),
        AssistantReactionBegin.alreadyPending,
      );
      final pending = await repository().pendingMessageReaction(
        actorId: actionActor,
        wsId: actionWorkspace,
        chatId: actionChat,
        messageId: actionMessage,
      );
      expect(pending!.toJson(), actionIntent.toJson());
      expect(
        await repository().confirmMessageReaction(
          actorId: actionActor,
          wsId: actionWorkspace,
          chatId: actionChat,
          messageId: actionMessage,
          opId: actionOp,
        ),
        isTrue,
      );
      await box.close();
      box = await openBox();
      expect(box.containsKey(key), isFalse);
      expect(await begin(intent: successor), AssistantReactionBegin.recorded);
      expect((await journal().pending(key))!.toJson(), successor.toJson());
      verifyZeroInteractions(api);
    },
  );

  test(
    'concurrent journal instances persist exactly one original intent',
    () async {
      expect(await Future.wait([begin(), begin(intent: successor)]), [
        AssistantReactionBegin.recorded,
        AssistantReactionBegin.alreadyPending,
      ]);
      await box.close();
      box = await openBox();
      expect(box.get(key), actionIntent.toJson());
      expect(await begin(), AssistantReactionBegin.alreadyPending);
    },
  );

  for (final marker in <Object?>[
    null,
    true,
    false,
    'true',
    1,
    <String>['true'],
    {'opId': actionOp, 'emoji': 'heart'},
    {'opId': 'invalid', 'emoji': 'heart', 'present': true},
  ]) {
    test(
      'malformed $marker marker cannot authorize replay or unrelated cleanup',
      () async {
        await box.put(key, marker);
        await box.flush();
        await box.close();
        box = await openBox();
        expect(await begin(), AssistantReactionBegin.alreadyPending);
        await expectLater(journal().pending(key), throwsFormatException);
        final hasMatchingId = marker is Map && marker['opId'] == actionOp;
        expect(await journal().confirm(key, opId: actionOp), hasMatchingId);
        expect(box.containsKey(key), !hasMatchingId);
        if (!hasMatchingId) expect(box.get(key), marker);
      },
    );
  }

  test(
    'another actor confirmation cannot erase original durable intent',
    () async {
      final otherKey = AssistantReactionJournal.keyFor(
        actionOther,
        actionWorkspace,
        actionChat,
        actionMessage,
      );
      expect(await begin(), AssistantReactionBegin.recorded);
      expect(
        await journal().begin(
          otherKey,
          intent: successor,
          isCurrent: () => true,
        ),
        AssistantReactionBegin.recorded,
      );
      expect(
        await journal().confirm(otherKey, opId: actionSuccessorOp),
        isTrue,
      );
      await box.close();
      box = await openBox();
      expect(box.get(key), actionIntent.toJson());
      expect(box.containsKey(otherKey), isFalse);
      expect(await begin(), AssistantReactionBegin.alreadyPending);
    },
  );

  test(
    'retired admission is unsent while origin receipt still cleans by ID',
    () async {
      expect(
        await begin(isCurrent: () => false),
        AssistantReactionBegin.failed,
      );
      expect(box.containsKey(key), isFalse);
      expect(await begin(), AssistantReactionBegin.recorded);
      // Confirmation deliberately has no current-UI lease.
      expect(await journal().confirm(key, opId: actionOp), isTrue);
      await box.close();
      box = await openBox();
      expect(box.containsKey(key), isFalse);
    },
  );

  test(
    'late receipt cannot remove successor marker across disk reopen',
    () async {
      expect(await begin(), AssistantReactionBegin.recorded);
      expect(await journal().confirm(key, opId: actionOp), isTrue);
      expect(await begin(intent: successor), AssistantReactionBegin.recorded);
      await box.close();
      box = await openBox();
      expect(await journal().confirm(key, opId: actionOp), isFalse);
      expect(box.get(key), successor.toJson());
      expect(await journal().confirm(key, opId: actionSuccessorOp), isTrue);
      expect(box.containsKey(key), isFalse);
    },
  );

  test(
    'signout removes actor metadata and retains only hashed op ID fence',
    () async {
      final otherKey = AssistantReactionJournal.keyFor(
        actionOther,
        actionWorkspace,
        actionChat,
        actionMessage,
      );
      expect(await begin(), AssistantReactionBegin.recorded);
      expect(
        await journal().begin(
          otherKey,
          intent: successor,
          isCurrent: () => true,
        ),
        AssistantReactionBegin.recorded,
      );
      await box.put('unrelated', {'preserve': true});
      expect(await journal().clearActor(actionActor), isTrue);
      await box.close();
      box = await openBox();
      expect(box.containsKey(key), isFalse);
      expect(box.get(otherKey), successor.toJson());
      expect(box.get('unrelated'), {'preserve': true});
      final retirementKey =
          'retired::${sha256.convert(utf8.encode(actionActor))}';
      expect(box.toMap(), {
        otherKey: successor.toJson(),
        'unrelated': {'preserve': true},
        retirementKey: [actionOp],
      });
      expect(await journal().retirementIds(actionActor), [actionOp]);
      expect(await journal().retirementIds(actionOther), isEmpty);
      expect(await journal().pending(key), isNull);
      await journal().finishRetirement(actionActor, [actionOp]);
      await box.close();
      box = await openBox();
      expect(box.containsKey(retirementKey), isFalse);
      expect(box.get(otherKey), successor.toJson());
    },
  );

  test(
    'finishing an older retirement preserves successor IDs and other actors',
    () async {
      expect(await begin(), AssistantReactionBegin.recorded);
      final epoch = AssistantReactionJournal.actorEpoch(actionActor);
      final clearing = journal().clearActor(actionActor);
      expect(AssistantReactionJournal.actorEpoch(actionActor), epoch + 1);
      expect(await clearing, isTrue);
      expect(await journal().retirementIds(actionActor), [actionOp]);
      expect(await begin(intent: successor), AssistantReactionBegin.recorded);
      expect(await journal().clearActor(actionActor), isTrue);
      final otherKey = AssistantReactionJournal.keyFor(
        actionOther,
        actionWorkspace,
        actionChat,
        actionMessage,
      );
      expect(
        await journal().begin(
          otherKey,
          intent: actionIntent,
          isCurrent: () => true,
        ),
        AssistantReactionBegin.recorded,
      );
      expect(await journal().clearActor(actionOther), isTrue);
      expect(
        await journal().retirementIds(actionActor),
        unorderedEquals([actionOp, actionSuccessorOp]),
      );
      await journal().finishRetirement(actionActor, [actionOp]);
      expect(await journal().retirementIds(actionActor), [actionSuccessorOp]);
      expect(await journal().retirementIds(actionOther), [actionOp]);
      // A late acknowledgement of old A cannot erase a newly admitted marker.
      expect(await begin(intent: successor), AssistantReactionBegin.recorded);
      await journal().finishRetirement(actionActor, [actionOp]);
      expect(box.get(key), successor.toJson());
      expect(await journal().retirementIds(actionActor), [actionSuccessorOp]);
    },
  );

  test(
    'invalid actor workspace conversation and message cannot create keys',
    () {
      final scope = [actionActor, actionWorkspace, actionChat, actionMessage];
      for (var index = 0; index < scope.length; index++) {
        final invalid = [...scope]..[index] = 'unscoped';
        expect(
          () => AssistantReactionJournal.keyFor(
            invalid[0],
            invalid[1],
            invalid[2],
            invalid[3],
          ),
          throwsFormatException,
        );
      }
    },
  );
}
