import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'chat_cubit_fixture.dart';

const _thumbs = '\u{1F44D}';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  late CubitHarness harness;
  setUp(() {
    harness = CubitHarness();
    harness.repository.onListMessages = (conversationId, before) async =>
        conversationId == threadId && before == null
        ? [
            fixtureMessage(1),
            fixtureMessage(
              2,
              reactions: const [
                ChatReactionSummary(emoji: _thumbs, count: 1, userIds: ['ada']),
              ],
            ),
          ]
        : const [];
  });
  tearDown(() => harness.dispose());

  ChatCubit cubitOf() => harness.cubit;
  ChatMessage loaded(int n) => cubitOf().state.selectedMessages.firstWhere(
    (message) => message.id == messageId(n),
  );

  group('reply', () {
    test('sends the target as replyToMessageId and then clears', () async {
      await harness.open();
      cubitOf().startReply(fixtureMessage(1));
      expect(cubitOf().state.replyToMessage?.id, messageId(1));

      await cubitOf().sendMessage('On it');
      await harness.settle();

      expect(harness.repository.sentReplyIds, [messageId(1)]);
      expect(cubitOf().state.replyToMessageId, isNull);
    });

    test('cancelling and switching threads drop the reply', () async {
      await harness.open();
      cubitOf().startReply(fixtureMessage(1));
      cubitOf().cancelReply();
      expect(cubitOf().state.replyToMessageId, isNull);

      cubitOf().startReply(fixtureMessage(1));
      await cubitOf().selectConversation(otherThreadId);
      expect(cubitOf().state.replyToMessageId, isNull);
    });

    test('a deleted target is not sent', () async {
      await harness.open();
      cubitOf().startReply(fixtureMessage(1));
      await cubitOf().deleteMessage(loaded(1));

      await cubitOf().sendMessage('Following up');
      await harness.settle();

      expect(harness.repository.sentReplyIds, [null]);
    });
  });

  test('deleteMessage marks the message deleted in place', () async {
    await harness.open();
    final order = cubitOf().state.conversations.map((c) => c.id).toList();

    await cubitOf().deleteMessage(loaded(1));

    expect(harness.repository.deletedIds, [messageId(1)]);
    expect(loaded(1).deletedAt, isNotNull);
    expect(loaded(1).content, isEmpty);
    expect(cubitOf().state.conversations.map((c) => c.id), order);
  });

  group('reactions', () {
    test('send the desired state and apply the server copy', () async {
      await harness.open();
      harness.repository.onSetReaction = (id, present, opId) async =>
          fixtureMessage(
            2,
            reactions: const [
              ChatReactionSummary(
                emoji: _thumbs,
                count: 2,
                userIds: ['ada', 'me'],
              ),
            ],
          );

      await cubitOf().toggleReaction(loaded(2), _thumbs);

      final call = harness.repository.reactionCalls.single;
      expect(call.present, isTrue);
      expect(call.opId, matches(RegExp(r'^[0-9a-f-]{36}$')));
      expect(loaded(2).reactions.single.userIds, ['ada', 'me']);
    });

    test('a failure rolls back only that reaction', () async {
      await harness.open();
      harness.repository.onSetReaction = (id, present, opId) =>
          Future.error(const ApiException(message: 'nope', statusCode: 500));

      await cubitOf().toggleReaction(loaded(2), _thumbs);

      expect(loaded(2).reactions.single.count, 1);
      expect(loaded(2).reactions.single.userIds, ['ada']);
      expect(cubitOf().state.error, 'nope');
    });

    test('an older response cannot undo a newer tap', () async {
      await harness.open();
      final first = Completer<ChatMessage>();
      final second = Completer<ChatMessage>();
      final replies = [first, second];
      harness.repository.onSetReaction = (id, present, opId) =>
          replies.removeAt(0).future;

      final add = cubitOf().toggleReaction(loaded(2), _thumbs);
      await harness.settle();
      final remove = cubitOf().toggleReaction(loaded(2), _thumbs);
      await harness.settle();
      expect(harness.repository.reactionCalls.map((call) => call.present), [
        true,
        false,
      ]);

      second.complete(
        fixtureMessage(
          2,
          reactions: const [
            ChatReactionSummary(emoji: _thumbs, count: 1, userIds: ['ada']),
          ],
        ),
      );
      await remove;
      first.complete(
        fixtureMessage(
          2,
          reactions: const [
            ChatReactionSummary(
              emoji: _thumbs,
              count: 2,
              userIds: ['ada', 'me'],
            ),
          ],
        ),
      );
      await add;

      expect(loaded(2).reactions.single.userIds, ['ada']);
    });
  });
}
