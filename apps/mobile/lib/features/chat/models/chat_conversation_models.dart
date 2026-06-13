part of 'chat_models.dart';

class ChatConversation extends Equatable {
  const ChatConversation({
    required this.id,
    required this.wsId,
    required this.type,
    required this.updatedAt,
    this.title,
    this.description,
    this.createdBy,
    this.latestMessage,
    this.members = const [],
    this.memberCount = 0,
    this.metadata = const {},
    this.unreadCount = 0,
    this.aiEnabled = false,
    this.createdAt,
    this.archivedAt,
  });

  factory ChatConversation.fromJson(Map<String, dynamic> json) {
    return ChatConversation(
      id: json['id']?.toString() ?? '',
      wsId: json['wsId']?.toString() ?? json['ws_id']?.toString() ?? '',
      type: _conversationTypeFromJson(json['type']),
      updatedAt:
          _dateFromJson(json['updatedAt'] ?? json['updated_at']) ??
          DateTime.fromMillisecondsSinceEpoch(0),
      title: json['title'] as String?,
      description: json['description'] as String?,
      createdBy:
          json['createdBy']?.toString() ?? json['created_by']?.toString(),
      latestMessage:
          json['latestMessage'] == null && json['latest_message'] == null
          ? null
          : ChatMessage.fromJson(
              _mapFromJson(json['latestMessage'] ?? json['latest_message']),
            ),
      members: _listFromJson(json['members'], ChatConversationMember.fromJson),
      memberCount:
          _intFromJson(json['memberCount'] ?? json['member_count']) ?? 0,
      metadata: _mapFromJson(json['metadata']),
      unreadCount:
          _intFromJson(json['unreadCount'] ?? json['unread_count']) ?? 0,
      aiEnabled:
          json['aiEnabled'] as bool? ?? json['ai_enabled'] as bool? ?? false,
      createdAt: _dateFromJson(json['createdAt'] ?? json['created_at']),
      archivedAt: _dateFromJson(json['archivedAt'] ?? json['archived_at']),
    );
  }

  final String id;
  final String wsId;
  final ChatConversationType type;
  final DateTime updatedAt;
  final String? title;
  final String? description;
  final String? createdBy;
  final ChatMessage? latestMessage;
  final List<ChatConversationMember> members;
  final int memberCount;
  final Map<String, dynamic> metadata;
  final int unreadCount;
  final bool aiEnabled;
  final DateTime? createdAt;
  final DateTime? archivedAt;

  bool get isPinned => members.any((member) => member.isPinned);
  bool get isMuted => members.any((member) => member.isMuted);

  String displayTitle({String fallback = 'Untitled chat'}) {
    final candidate = title?.trim();
    if (candidate != null && candidate.isNotEmpty) return candidate;
    if (type == ChatConversationType.ai) return 'Mira';
    final memberNames = members
        .map((member) => member.user.displayName.trim())
        .where((name) => name.isNotEmpty)
        .toList(growable: false);
    if (memberNames.isNotEmpty) return memberNames.take(3).join(', ');
    return fallback;
  }

  ChatConversation copyWith({
    String? id,
    String? wsId,
    ChatConversationType? type,
    DateTime? updatedAt,
    String? title,
    String? description,
    String? createdBy,
    ChatMessage? latestMessage,
    List<ChatConversationMember>? members,
    int? memberCount,
    Map<String, dynamic>? metadata,
    int? unreadCount,
    bool? aiEnabled,
    DateTime? createdAt,
    DateTime? archivedAt,
  }) {
    return ChatConversation(
      id: id ?? this.id,
      wsId: wsId ?? this.wsId,
      type: type ?? this.type,
      updatedAt: updatedAt ?? this.updatedAt,
      title: title ?? this.title,
      description: description ?? this.description,
      createdBy: createdBy ?? this.createdBy,
      latestMessage: latestMessage ?? this.latestMessage,
      members: members ?? this.members,
      memberCount: memberCount ?? this.memberCount,
      metadata: metadata ?? this.metadata,
      unreadCount: unreadCount ?? this.unreadCount,
      aiEnabled: aiEnabled ?? this.aiEnabled,
      createdAt: createdAt ?? this.createdAt,
      archivedAt: archivedAt ?? this.archivedAt,
    );
  }

  @override
  List<Object?> get props => [
    id,
    wsId,
    type,
    updatedAt,
    title,
    description,
    createdBy,
    latestMessage,
    members,
    memberCount,
    metadata,
    unreadCount,
    aiEnabled,
    createdAt,
    archivedAt,
  ];
}

class ChatConversationPage extends Equatable {
  const ChatConversationPage({required this.conversations, this.nextOffset});

  factory ChatConversationPage.fromJson(Map<String, dynamic> json) {
    return ChatConversationPage(
      conversations: _listFromJson(
        json['conversations'],
        ChatConversation.fromJson,
      ),
      nextOffset: _intFromJson(json['nextOffset'] ?? json['next_offset']),
    );
  }

  final List<ChatConversation> conversations;
  final int? nextOffset;

  @override
  List<Object?> get props => [conversations, nextOffset];
}
