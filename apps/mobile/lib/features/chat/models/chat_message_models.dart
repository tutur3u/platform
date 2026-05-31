part of 'chat_models.dart';

class ChatMessage extends Equatable {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.content,
    required this.kind,
    this.attachments = const [],
    this.metadata = const {},
    this.reactions = const [],
    this.replyToMessageId,
    this.sender,
    this.senderId,
    this.createdAt,
    this.updatedAt,
    this.editedAt,
    this.deletedAt,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id']?.toString() ?? '',
      conversationId:
          json['conversationId']?.toString() ??
          json['conversation_id']?.toString() ??
          '',
      content: json['content']?.toString() ?? '',
      kind: _messageKindFromJson(json['kind']),
      attachments: _listFromJson(json['attachments'], ChatAttachment.fromJson),
      metadata: _mapFromJson(json['metadata']),
      reactions: _listFromJson(json['reactions'], ChatReactionSummary.fromJson),
      replyToMessageId:
          json['replyToMessageId']?.toString() ??
          json['reply_to_message_id']?.toString(),
      sender: json['sender'] == null
          ? null
          : ChatUserProfile.fromJson(_mapFromJson(json['sender'])),
      senderId: json['senderId']?.toString() ?? json['sender_id']?.toString(),
      createdAt: _dateFromJson(json['createdAt'] ?? json['created_at']),
      updatedAt: _dateFromJson(json['updatedAt'] ?? json['updated_at']),
      editedAt: _dateFromJson(json['editedAt'] ?? json['edited_at']),
      deletedAt: _dateFromJson(json['deletedAt'] ?? json['deleted_at']),
    );
  }

  final String id;
  final String conversationId;
  final String content;
  final ChatMessageKind kind;
  final List<ChatAttachment> attachments;
  final Map<String, dynamic> metadata;
  final List<ChatReactionSummary> reactions;
  final String? replyToMessageId;
  final ChatUserProfile? sender;
  final String? senderId;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? editedAt;
  final DateTime? deletedAt;

  ChatMessage copyWith({
    String? id,
    String? conversationId,
    String? content,
    ChatMessageKind? kind,
    List<ChatAttachment>? attachments,
    Map<String, dynamic>? metadata,
    List<ChatReactionSummary>? reactions,
    String? replyToMessageId,
    ChatUserProfile? sender,
    String? senderId,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? editedAt,
    DateTime? deletedAt,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      conversationId: conversationId ?? this.conversationId,
      content: content ?? this.content,
      kind: kind ?? this.kind,
      attachments: attachments ?? this.attachments,
      metadata: metadata ?? this.metadata,
      reactions: reactions ?? this.reactions,
      replyToMessageId: replyToMessageId ?? this.replyToMessageId,
      sender: sender ?? this.sender,
      senderId: senderId ?? this.senderId,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      editedAt: editedAt ?? this.editedAt,
      deletedAt: deletedAt ?? this.deletedAt,
    );
  }

  @override
  List<Object?> get props => [
    id,
    conversationId,
    content,
    kind,
    attachments,
    metadata,
    reactions,
    replyToMessageId,
    sender,
    senderId,
    createdAt,
    updatedAt,
    editedAt,
    deletedAt,
  ];
}
