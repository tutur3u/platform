import 'package:mobile/features/chat/models/chat_models.dart';

/// One row of a conversation thread, in chronological order.
sealed class ChatThreadItem {
  const ChatThreadItem();
}

/// Separator before the first message of a calendar day (local time).
final class ChatDayItem extends ChatThreadItem {
  const ChatDayItem(this.day);
  final DateTime day;
}

/// Marks where messages the viewer has not read begin.
final class ChatUnreadItem extends ChatThreadItem {
  const ChatUnreadItem();
}

final class ChatMessageItem extends ChatThreadItem {
  const ChatMessageItem({
    required this.message,
    required this.isMine,
    required this.startsGroup,
    required this.endsGroup,
  });

  final ChatMessage message;
  final bool isMine;

  /// First message of a run from one sender: shows the avatar and name.
  final bool startsGroup;

  /// Last message of the run: shows the time under the bubble.
  final bool endsGroup;
}

/// Messages from one sender within this gap share a group.
const chatGroupGap = Duration(minutes: 5);

String? _senderKey(ChatMessage message) => switch (message.kind) {
  ChatMessageKind.system => null,
  ChatMessageKind.assistant => 'assistant:${message.senderId ?? ''}',
  ChatMessageKind.user => message.senderId,
};

DateTime _localDay(DateTime at) {
  final local = at.toLocal();
  return DateTime(local.year, local.month, local.day);
}

/// Builds thread rows: a day separator before each new day, an unread
/// divider before the first message from someone else after [lastReadAt],
/// and sender groups broken by day, sender, [chatGroupGap] and the divider.
List<ChatThreadItem> buildChatThreadItems(
  List<ChatMessage> messages, {
  required String? currentUserId,
  DateTime? lastReadAt,
}) {
  final items = <ChatThreadItem>[];
  DateTime? previousDay;
  var unreadPlaced = lastReadAt == null;
  ChatMessage? previous;
  final rows = <({ChatMessage message, bool startsGroup, bool unreadBefore})>[];

  for (final message in messages) {
    final at = message.createdAt;
    final day = at == null ? previousDay : _localDay(at);
    final newDay = day != null && day != previousDay;
    final isMine = currentUserId != null && message.senderId == currentUserId;
    var unreadBefore = false;
    if (!unreadPlaced &&
        !isMine &&
        message.kind != ChatMessageKind.system &&
        at != null &&
        at.isAfter(lastReadAt!) &&
        previous != null) {
      unreadBefore = true;
      unreadPlaced = true;
    }
    final key = _senderKey(message);
    final previousAt = previous?.createdAt;
    final continues =
        previous != null &&
        !newDay &&
        !unreadBefore &&
        key != null &&
        key == _senderKey(previous) &&
        previous.deletedAt == null &&
        (at == null ||
            previousAt == null ||
            at.difference(previousAt) <= chatGroupGap);
    rows.add((
      message: message,
      startsGroup: !continues,
      unreadBefore: unreadBefore,
    ));
    if (day != null) previousDay = day;
    previous = message;
  }

  DateTime? shownDay;
  for (var index = 0; index < rows.length; index++) {
    final row = rows[index];
    final at = row.message.createdAt;
    if (at != null) {
      final day = _localDay(at);
      if (day != shownDay) {
        items.add(ChatDayItem(day));
        shownDay = day;
      }
    }
    if (row.unreadBefore) items.add(const ChatUnreadItem());
    final next = index + 1 < rows.length ? rows[index + 1] : null;
    items.add(
      ChatMessageItem(
        message: row.message,
        isMine: currentUserId != null && row.message.senderId == currentUserId,
        startsGroup: row.startsGroup,
        endsGroup: next == null || next.startsGroup,
      ),
    );
  }
  return items;
}

/// The viewer's read marker in [conversation], if the server sent one.
DateTime? chatLastReadAt(ChatConversation? conversation, String? userId) {
  if (conversation == null || userId == null) return null;
  for (final member in conversation.members) {
    if (member.userId == userId) return member.lastReadAt;
  }
  return null;
}
