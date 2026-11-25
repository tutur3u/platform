import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_thread_items.dart';

ChatMessage _message(
  String id,
  String sender,
  DateTime at, {
  ChatMessageKind kind = ChatMessageKind.user,
}) => ChatMessage(
  id: id,
  conversationId: 'c',
  content: id,
  kind: kind,
  senderId: sender,
  createdAt: at,
);

void main() {
  final day = DateTime(2026, 11, 20, 9);

  test('groups consecutive messages from one sender within five minutes', () {
    final items = buildChatThreadItems([
      _message('a1', 'ada', day),
      _message('a2', 'ada', day.add(const Duration(minutes: 4))),
      _message('a3', 'ada', day.add(const Duration(minutes: 20))),
      _message('m1', 'me', day.add(const Duration(minutes: 21))),
    ], currentUserId: 'me');
    final messages = items.whereType<ChatMessageItem>().toList();
    expect(items.first, isA<ChatDayItem>());
    expect(
      messages.map((item) => (item.startsGroup, item.endsGroup)).toList(),
      [(true, false), (false, true), (true, true), (true, true)],
    );
    expect(messages.last.isMine, isTrue);
  });

  test('separates days and marks the first unread message', () {
    final items = buildChatThreadItems(
      [
        _message('old', 'ada', day),
        _message('mine', 'me', day.add(const Duration(minutes: 1))),
        _message('new', 'ada', day.add(const Duration(days: 1))),
        _message('newer', 'ada', day.add(const Duration(days: 1, minutes: 1))),
      ],
      currentUserId: 'me',
      lastReadAt: day.add(const Duration(hours: 1)),
    );
    expect(items.map((item) => item.runtimeType).toList(), [
      ChatDayItem,
      ChatMessageItem,
      ChatMessageItem,
      ChatDayItem,
      ChatUnreadItem,
      ChatMessageItem,
      ChatMessageItem,
    ]);
    final unreadRun = items.whereType<ChatMessageItem>().skip(2).toList();
    expect(unreadRun.first.startsGroup, isTrue);
    expect(unreadRun.last.startsGroup, isFalse);
  });

  test('system messages never join a group', () {
    final items = buildChatThreadItems([
      _message('s1', 'ada', day, kind: ChatMessageKind.system),
      _message('s2', 'ada', day, kind: ChatMessageKind.system),
    ], currentUserId: 'me');
    expect(
      items.whereType<ChatMessageItem>().every((item) => item.startsGroup),
      isTrue,
    );
  });

  test('reactionsWith sets the viewer state idempotently', () {
    const thumbs = '\u{1F44D}';
    final added = reactionsWith(const [], thumbs, 'me', true);
    expect(added.single.count, 1);
    expect(reactionsWith(added, thumbs, 'me', true), added);
    final joined = reactionsWith(
      const [
        ChatReactionSummary(emoji: thumbs, count: 1, userIds: ['ada']),
      ],
      thumbs,
      'me',
      true,
    );
    expect(joined.single.count, 2);
    expect(joined.single.userIds, ['ada', 'me']);
    expect(reactionsWith(added, thumbs, 'me', false), isEmpty);
    expect(reactionsWith(const [], thumbs, 'me', false), isEmpty);
  });
}
