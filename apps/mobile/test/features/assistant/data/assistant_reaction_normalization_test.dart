import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../cubit/assistant_chat_persistence_actions_harness.dart';

Map<String, dynamic> _canonicalReceipt(Map<String, dynamic> body) =>
    actionOperationReceipt(
      {...body, 'emoji': (body['emoji'] as String).trim()},
      message: {
        ...actionReceipt(),
        if (body['present'] == false) 'reactions': <dynamic>[],
      },
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(registerActionOperationFallbacks);

  test('const intent exposes and serializes canonical emoji', () {
    const intent = AssistantReactionIntent(
      opId: actionOp,
      emoji: ' \theart\n ',
      present: false,
    );
    expect(intent.emoji, 'heart');
    expect(intent.toJson(), {
      'opId': actionOp,
      'emoji': 'heart',
      'present': false,
    });
  });

  for (final present in [true, false]) {
    test('decode canonicalizes without changing desired state $present', () {
      final intent = AssistantReactionIntent.decode({
        'opId': actionOp,
        'emoji': ' \theart\n ',
        'present': present,
      });
      expect(intent.emoji, 'heart');
      expect(intent.toJson(), {
        'opId': actionOp,
        'emoji': 'heart',
        'present': present,
      });
    });
  }

  test('malformed and blank decoded intents fail closed', () {
    for (final raw in <Object?>[
      null,
      true,
      'heart',
      <Object?>[],
      {'opId': actionOp, 'emoji': 'heart'},
      {'opId': 'invalid', 'emoji': 'heart', 'present': true},
      {'opId': actionOp, 'emoji': 'heart', 'present': 'true'},
      for (final emoji in <Object?>[
        null,
        1,
        <String>[],
        '',
        ' \t\n ',
        'x' * 65,
      ])
        {'opId': actionOp, 'emoji': emoji, 'present': true},
    ]) {
      expect(
        () => AssistantReactionIntent.decode(raw),
        throwsFormatException,
        reason: 'Must reject $raw',
      );
    }
  });

  group('canonical reaction journal and receipts', () {
    late Directory directory;
    late Box<dynamic> box;
    late AssistantReactionJournal journal;
    late ActionsApi api;
    late ActionsRepository repository;
    late AssistantChatCubit cubit;
    late int initialIds;
    late List<Map<String, dynamic>> bodies;
    late Future<Map<String, dynamic>> Function(Map<String, dynamic>) dispatch;
    const boxName = 'reaction_normalization';
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

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      directory = await Directory.systemTemp.createTemp('reaction-normalize-');
      box = await openBox();
      journal = AssistantReactionJournal(openBox: () async => box);
      api = ActionsApi();
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
      bodies = [];
      dispatch = (body) async => _canonicalReceipt(body);
      when(
        () => api.putJsonOperationAcknowledged(
          any(),
          any(),
          admission: any(named: 'admission'),
          onAcknowledged: any(named: 'onAcknowledged'),
        ),
      ).thenAnswer(
        (call) => acknowledgeActionOperation(call, (body) {
          bodies.add(Map<String, dynamic>.of(body));
          return dispatch(body);
        }),
      );
      when(() => api.getJson(any())).thenAnswer((call) async {
        expect(
          call.positionalArguments.single,
          '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
          '$actionChat/reactions?messageId=$actionMessage',
        );
        expect(box.containsKey(key), isFalse);
        return _canonicalReceipt(bodies.last);
      });
      await cubit.openChatById(actionWorkspace, actionChat);
      initialIds = repository.ids;
    });

    tearDown(() async {
      await cubit.close();
      await repository.frames.close();
      if (box.isOpen) await box.close();
      await directory.delete(recursive: true);
    });

    test(
      'padded input is journaled canonically and cleared by server ACK',
      () async {
        dispatch = (body) async {
          expect(body['emoji'], 'heart');
          expect(body['present'], isTrue);
          expect(box.get(key), {
            'opId': body['opId'],
            'emoji': 'heart',
            'present': true,
          });
          final receipt = _canonicalReceipt(body);
          expect((receipt['operation'] as Map)['id'], body['opId']);
          return receipt;
        };
        expect(
          await cubit.toggleReaction(actionMessage, ' \theart\n '),
          AssistantReactionResult.updated,
        );
        expect(bodies, hasLength(1));
        expect(box.containsKey(key), isFalse);
        expect(await journal.pending(key), isNull);
        expect(cubit.needsReactionRefresh(actionMessage), isFalse);
        expect(cubit.state.messages.single.reactions.single.emoji, 'heart');
        expect(
          cubit.state.messages.single.parts.single.text,
          'Current content',
        );
      },
    );

    test('padded selected reaction chooses removal', () async {
      repository.rows = [
        actionRow.copyWith(
          reactions: const [
            ChatReactionSummary(
              emoji: 'heart',
              count: 1,
              userIds: [actionActor],
            ),
          ],
        ),
      ];
      await cubit.openChatById(actionWorkspace, actionChat);
      expect(
        await cubit.toggleReaction(actionMessage, ' \theart\n '),
        AssistantReactionResult.updated,
      );
      expect(bodies.single['emoji'], 'heart');
      expect(bodies.single['present'], isFalse);
      expect(cubit.state.messages.single.reactions, isEmpty);
      expect(box.containsKey(key), isFalse);
    });

    for (final present in [true, false]) {
      test(
        'old padded pending intent replays original ID and $present',
        () async {
          final legacy = {
            'opId': actionOp,
            'emoji': ' \theart\n ',
            'present': present,
          };
          await box.put(key, legacy);
          await box.flush();
          await box.close();
          box = await openBox();
          expect(box.get(key), legacy);
          expect((await journal.pending(key))!.toJson(), {
            'opId': actionOp,
            'emoji': 'heart',
            'present': present,
          });
          dispatch = (body) async {
            expect(box.get(key), legacy);
            return _canonicalReceipt(body);
          };
          expect(
            await cubit.refreshReactions(actionMessage),
            AssistantReactionResult.updated,
          );
          expect(bodies.single, {
            'messageId': actionMessage,
            'opId': actionOp,
            'emoji': 'heart',
            'present': present,
          });
          expect(repository.ids, initialIds);
          expect(box.containsKey(key), isFalse);
          expect(
            cubit.state.messages.single.reactions,
            present ? isNotEmpty : isEmpty,
          );
          await box.close();
          box = await openBox();
          expect(await journal.pending(key), isNull);
        },
      );
    }

    test(
      'unknown write retains canonical intent and ID through replay',
      () async {
        dispatch = (_) async => throw StateError('Synthetic unknown write');
        expect(
          await cubit.toggleReaction(actionMessage, ' \theart\n '),
          AssistantReactionResult.unknown,
        );
        final original = Map<String, dynamic>.of(bodies.single);
        final pending = (await journal.pending(key))!.toJson();
        expect(pending, {
          'opId': original['opId'],
          'emoji': 'heart',
          'present': true,
        });
        expect(cubit.needsReactionRefresh(actionMessage), isTrue);
        expect(
          await cubit.toggleReaction(actionMessage, 'heart'),
          AssistantReactionResult.refreshRequired,
        );
        expect(bodies, hasLength(1));
        await box.close();
        box = await openBox();
        expect((await journal.pending(key))!.toJson(), pending);
        dispatch = (body) async => _canonicalReceipt(body);
        expect(
          await cubit.refreshReactions(actionMessage),
          AssistantReactionResult.updated,
        );
        expect(bodies, [original, original]);
        expect(repository.ids, initialIds + 1);
        expect(box.containsKey(key), isFalse);
        expect(cubit.needsReactionRefresh(actionMessage), isFalse);
        verifyNever(() => api.postJson(any(), any()));
      },
    );

    test(
      'different receipt intent cannot clear a canonical pending write',
      () async {
        dispatch = (body) async =>
            _canonicalReceipt({...body, 'present': false});
        expect(
          await cubit.toggleReaction(actionMessage, ' \theart\n '),
          AssistantReactionResult.unknown,
        );
        expect((await journal.pending(key))!.toJson(), {
          'opId': bodies.single['opId'],
          'emoji': 'heart',
          'present': true,
        });
        expect(cubit.needsReactionRefresh(actionMessage), isTrue);
      },
    );

    test('blank input never journals or dispatches', () async {
      for (final emoji in ['', ' \t\n ']) {
        expect(
          await cubit.toggleReaction(actionMessage, emoji),
          AssistantReactionResult.unavailable,
        );
      }
      expect(repository.ids, initialIds);
      expect(box.containsKey(key), isFalse);
      expect(bodies, isEmpty);
      verifyZeroInteractions(api);
    });

    test('invalid stored emoji cannot authorize replay or cleanup', () async {
      for (final emoji in <Object?>[' \t\n ', 1, 'x' * 65]) {
        final invalid = {'opId': actionOp, 'emoji': emoji, 'present': true};
        await box.put(key, invalid);
        await box.flush();
        expect(
          await cubit.refreshReactions(actionMessage),
          AssistantReactionResult.refreshRequired,
        );
        expect(box.get(key), invalid);
      }
      expect(repository.ids, initialIds);
      expect(bodies, isEmpty);
      verifyZeroInteractions(api);
    });
  });
}
