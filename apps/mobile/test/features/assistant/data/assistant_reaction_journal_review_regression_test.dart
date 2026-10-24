import 'dart:io';

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

  Future<Box<dynamic>> openBox() => Hive.openBox<dynamic>(
    boxName,
    path: directory.path,
    crashRecovery: false,
  );
  AssistantReactionJournal journal() =>
      AssistantReactionJournal(openBox: () async => box);

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('reaction-journal-');
    box = await openBox();
  });
  tearDown(() async {
    if (box.isOpen) await box.close();
    await directory.delete(recursive: true);
  });

  test(
    'flushed unknown marker survives disk reopen and new repositories',
    () async {
      final api = ActionsApi();
      AssistantRepository repository() => AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        currentUserId: () => actionActor,
        reactionJournal: journal(),
      );
      Future<bool> begin(AssistantRepository instance) =>
          instance.beginMessageReaction(
            wsId: actionWorkspace,
            chatId: actionChat,
            messageId: actionMessage,
            isCurrent: () => true,
          );

      expect(await begin(repository()), isTrue);
      await box.close();
      box = await openBox();
      expect(box.get(key), isTrue);
      expect(await begin(repository()), isFalse);
      expect(await journal().begin(key, isCurrent: () => true), isFalse);
      expect(box.get(key), isTrue);

      expect(
        await repository().confirmMessageReaction(
          wsId: actionWorkspace,
          chatId: actionChat,
          messageId: actionMessage,
          isCurrent: () => true,
        ),
        isTrue,
      );
      await box.close();
      box = await openBox();
      expect(box.containsKey(key), isFalse);
      expect(await begin(repository()), isTrue);
      verifyZeroInteractions(api);
    },
  );

  test(
    'concurrent journal instances allow only one begin across disk reopen',
    () async {
      expect(
        await Future.wait([
          journal().begin(key, isCurrent: () => true),
          journal().begin(key, isCurrent: () => true),
        ]),
        [true, false],
      );
      await box.close();
      box = await openBox();
      expect(box.get(key), isTrue);
      expect(await journal().begin(key, isCurrent: () => true), isFalse);
    },
  );

  for (final marker in <Object?>[
    null,
    false,
    'true',
    1,
    <String>['true'],
  ]) {
    test(
      'existing malformed $marker marker stays held after disk reopen',
      () async {
        await box.put(key, marker);
        await box.flush();
        await box.close();
        box = await openBox();
        expect(box.containsKey(key), isTrue);
        expect(await journal().begin(key, isCurrent: () => true), isFalse);
        expect(box.get(key), marker);
        expect(await journal().confirm(key, isCurrent: () => true), isTrue);
        await box.close();
        box = await openBox();
        expect(box.containsKey(key), isFalse);
      },
    );
  }

  test(
    'confirming another actor cannot clear the original durable marker',
    () async {
      final otherKey = AssistantReactionJournal.keyFor(
        actionOther,
        actionWorkspace,
        actionChat,
        actionMessage,
      );
      expect(key, isNot(otherKey));
      expect(await journal().begin(key, isCurrent: () => true), isTrue);
      expect(await journal().begin(otherKey, isCurrent: () => true), isTrue);
      expect(await journal().confirm(otherKey, isCurrent: () => true), isTrue);
      await box.close();
      box = await openBox();
      expect(box.get(key), isTrue);
      expect(box.containsKey(otherKey), isFalse);
      expect(await journal().begin(key, isCurrent: () => true), isFalse);
      expect(await journal().begin(otherKey, isCurrent: () => true), isTrue);
    },
  );

  test('retired guard cannot begin or confirm a durable marker', () async {
    expect(await journal().begin(key, isCurrent: () => false), isFalse);
    expect(box.containsKey(key), isFalse);
    expect(await journal().begin(key, isCurrent: () => true), isTrue);
    expect(await journal().confirm(key, isCurrent: () => false), isFalse);
    await box.close();
    box = await openBox();
    expect(box.get(key), isTrue);
    expect(await journal().begin(key, isCurrent: () => true), isFalse);
  });

  test(
    'invalid actor workspace conversation and message IDs cannot create keys',
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
