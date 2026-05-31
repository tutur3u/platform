part of 'chat_models.dart';

class ChatUserProfile extends Equatable {
  const ChatUserProfile({
    required this.id,
    required this.displayName,
    this.avatarUrl,
    this.handle,
  });

  factory ChatUserProfile.fromJson(Map<String, dynamic> json) {
    return ChatUserProfile(
      id: json['id']?.toString() ?? '',
      displayName: json['displayName']?.toString().trim().isNotEmpty == true
          ? json['displayName'].toString()
          : json['display_name']?.toString() ?? 'Unknown',
      avatarUrl: json['avatarUrl'] as String? ?? json['avatar_url'] as String?,
      handle: json['handle'] as String?,
    );
  }

  final String id;
  final String displayName;
  final String? avatarUrl;
  final String? handle;

  @override
  List<Object?> get props => [id, displayName, avatarUrl, handle];
}

class ChatConversationMember extends Equatable {
  const ChatConversationMember({
    required this.id,
    required this.conversationId,
    required this.userId,
    required this.user,
    required this.role,
    this.joinedAt,
    this.lastReadAt,
    this.mutedAt,
    this.pinnedAt,
    this.archivedAt,
  });

  factory ChatConversationMember.fromJson(Map<String, dynamic> json) {
    return ChatConversationMember(
      id: json['id']?.toString() ?? '',
      conversationId:
          json['conversationId']?.toString() ??
          json['conversation_id']?.toString() ??
          '',
      userId: json['userId']?.toString() ?? json['user_id']?.toString() ?? '',
      user: ChatUserProfile.fromJson(_mapFromJson(json['user'])),
      role: json['role']?.toString() ?? 'member',
      joinedAt: _dateFromJson(json['joinedAt'] ?? json['joined_at']),
      lastReadAt: _dateFromJson(json['lastReadAt'] ?? json['last_read_at']),
      mutedAt: _dateFromJson(json['mutedAt'] ?? json['muted_at']),
      pinnedAt: _dateFromJson(json['pinnedAt'] ?? json['pinned_at']),
      archivedAt: _dateFromJson(json['archivedAt'] ?? json['archived_at']),
    );
  }

  final String id;
  final String conversationId;
  final String userId;
  final ChatUserProfile user;
  final String role;
  final DateTime? joinedAt;
  final DateTime? lastReadAt;
  final DateTime? mutedAt;
  final DateTime? pinnedAt;
  final DateTime? archivedAt;

  bool get isMuted => mutedAt != null;
  bool get isPinned => pinnedAt != null;

  @override
  List<Object?> get props => [
    id,
    conversationId,
    userId,
    user,
    role,
    joinedAt,
    lastReadAt,
    mutedAt,
    pinnedAt,
    archivedAt,
  ];
}

class ChatAttachment extends Equatable {
  const ChatAttachment({
    required this.id,
    required this.conversationId,
    required this.filename,
    required this.storagePath,
    this.messageId,
    this.contentType,
    this.fullPath,
    this.sizeBytes,
    this.storageWsId,
    this.uploaderId,
    this.createdAt,
  });

  factory ChatAttachment.fromJson(Map<String, dynamic> json) {
    return ChatAttachment(
      id: json['id']?.toString() ?? '',
      conversationId:
          json['conversationId']?.toString() ??
          json['conversation_id']?.toString() ??
          '',
      filename: json['filename']?.toString() ?? 'Attachment',
      storagePath:
          json['storagePath']?.toString() ??
          json['storage_path']?.toString() ??
          json['path']?.toString() ??
          '',
      messageId:
          json['messageId']?.toString() ?? json['message_id']?.toString(),
      contentType:
          json['contentType']?.toString() ?? json['content_type']?.toString(),
      fullPath: json['fullPath']?.toString() ?? json['full_path']?.toString(),
      sizeBytes: _intFromJson(json['sizeBytes'] ?? json['size_bytes']),
      storageWsId:
          json['storageWsId']?.toString() ?? json['storage_ws_id']?.toString(),
      uploaderId:
          json['uploaderId']?.toString() ?? json['uploader_id']?.toString(),
      createdAt: _dateFromJson(json['createdAt'] ?? json['created_at']),
    );
  }

  final String id;
  final String conversationId;
  final String filename;
  final String storagePath;
  final String? messageId;
  final String? contentType;
  final String? fullPath;
  final int? sizeBytes;
  final String? storageWsId;
  final String? uploaderId;
  final DateTime? createdAt;

  bool get isImage => contentType?.startsWith('image/') ?? false;

  ChatAttachmentDraft toDraft() {
    return ChatAttachmentDraft(
      filename: filename,
      path: storagePath,
      contentType: contentType,
      fullPath: fullPath,
      sizeBytes: sizeBytes,
      storageWsId: storageWsId,
    );
  }

  @override
  List<Object?> get props => [
    id,
    conversationId,
    filename,
    storagePath,
    messageId,
    contentType,
    fullPath,
    sizeBytes,
    storageWsId,
    uploaderId,
    createdAt,
  ];
}

class ChatAttachmentDraft extends Equatable {
  const ChatAttachmentDraft({
    required this.filename,
    required this.path,
    this.contentType,
    this.fullPath,
    this.sizeBytes,
    this.storageWsId,
  });

  final String filename;
  final String path;
  final String? contentType;
  final String? fullPath;
  final int? sizeBytes;
  final String? storageWsId;

  Map<String, dynamic> toJson() {
    return {
      'filename': filename,
      'path': path,
      'contentType': contentType,
      'fullPath': fullPath,
      'sizeBytes': sizeBytes,
      'storageWsId': storageWsId,
    };
  }

  @override
  List<Object?> get props => [
    filename,
    path,
    contentType,
    fullPath,
    sizeBytes,
    storageWsId,
  ];
}

class ChatReactionSummary extends Equatable {
  const ChatReactionSummary({
    required this.emoji,
    this.count = 0,
    this.userIds = const [],
  });

  factory ChatReactionSummary.fromJson(Map<String, dynamic> json) {
    return ChatReactionSummary(
      emoji: json['emoji']?.toString() ?? '',
      count: _intFromJson(json['count']) ?? 0,
      userIds:
          (json['userIds'] as List<dynamic>? ??
                  json['user_ids'] as List<dynamic>? ??
                  const [])
              .map((value) => value.toString())
              .where((value) => value.isNotEmpty)
              .toList(growable: false),
    );
  }

  final String emoji;
  final int count;
  final List<String> userIds;

  @override
  List<Object?> get props => [emoji, count, userIds];
}
