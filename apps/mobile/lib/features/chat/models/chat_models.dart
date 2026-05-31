import 'package:equatable/equatable.dart';

part 'chat_identity_models.dart';
part 'chat_message_models.dart';
part 'chat_conversation_models.dart';
part 'chat_content_models.dart';
part 'chat_ai_models.dart';
part 'chat_friend_models.dart';

enum ChatConversationType { ai, channel, direct, group }

enum ChatMessageKind { assistant, system, user }

enum ChatAiCreditSource { personal, workspace }

enum ChatAiThinkingMode { fast, thinking }

enum ChatFriendRequestStatus { accepted, declined, pending }

enum ChatScope { personal, workspaces }

enum ChatArchivedFilter { active, all, archived }

ChatConversationType _conversationTypeFromJson(Object? value) {
  return ChatConversationType.values.firstWhere(
    (type) => type.name == value,
    orElse: () => ChatConversationType.channel,
  );
}

ChatMessageKind _messageKindFromJson(Object? value) {
  return ChatMessageKind.values.firstWhere(
    (kind) => kind.name == value,
    orElse: () => ChatMessageKind.user,
  );
}

ChatAiCreditSource _creditSourceFromJson(Object? value) {
  return ChatAiCreditSource.values.firstWhere(
    (source) => source.name == value,
    orElse: () => ChatAiCreditSource.workspace,
  );
}

ChatAiThinkingMode _thinkingModeFromJson(Object? value) {
  return ChatAiThinkingMode.values.firstWhere(
    (mode) => mode.name == value,
    orElse: () => ChatAiThinkingMode.fast,
  );
}

ChatFriendRequestStatus _friendRequestStatusFromJson(Object? value) {
  return ChatFriendRequestStatus.values.firstWhere(
    (status) => status.name == value,
    orElse: () => ChatFriendRequestStatus.pending,
  );
}

DateTime? _dateFromJson(Object? value) {
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value);
}

int? _intFromJson(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

double _doubleFromJson(Object? value) {
  if (value is double) return value;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0;
  return 0;
}

Map<String, dynamic> _mapFromJson(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map<Object?, Object?>) {
    return value.map((key, value) => MapEntry(key.toString(), value));
  }
  return const <String, dynamic>{};
}

List<T> _listFromJson<T>(
  Object? value,
  T Function(Map<String, dynamic>) decode,
) {
  if (value is! List) return const [];
  return value
      .whereType<Map<Object?, Object?>>()
      .map((item) => decode(_mapFromJson(item)))
      .toList(growable: false);
}
