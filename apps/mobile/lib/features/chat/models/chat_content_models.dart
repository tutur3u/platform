part of 'chat_models.dart';

class ChatLinkPreview extends Equatable {
  const ChatLinkPreview({
    required this.url,
    this.title,
    this.description,
    this.imageUrl,
    this.siteName,
    this.error,
  });

  factory ChatLinkPreview.fromJson(Map<String, dynamic> json) {
    return ChatLinkPreview(
      url: json['url']?.toString() ?? '',
      title: json['title'] as String?,
      description: json['description'] as String?,
      imageUrl: json['imageUrl'] as String? ?? json['image_url'] as String?,
      siteName: json['siteName'] as String? ?? json['site_name'] as String?,
      error: json['error'] as String?,
    );
  }

  final String url;
  final String? title;
  final String? description;
  final String? imageUrl;
  final String? siteName;
  final String? error;

  @override
  List<Object?> get props => [
    url,
    title,
    description,
    imageUrl,
    siteName,
    error,
  ];
}

class ChatSharedLink extends Equatable {
  const ChatSharedLink({
    required this.conversationId,
    required this.messageId,
    required this.url,
    this.sender,
    this.createdAt,
  });

  factory ChatSharedLink.fromJson(Map<String, dynamic> json) {
    return ChatSharedLink(
      conversationId:
          json['conversationId']?.toString() ??
          json['conversation_id']?.toString() ??
          '',
      messageId:
          json['messageId']?.toString() ?? json['message_id']?.toString() ?? '',
      url: json['url']?.toString() ?? '',
      sender: json['sender'] == null
          ? null
          : ChatUserProfile.fromJson(_mapFromJson(json['sender'])),
      createdAt: _dateFromJson(json['createdAt'] ?? json['created_at']),
    );
  }

  final String conversationId;
  final String messageId;
  final String url;
  final ChatUserProfile? sender;
  final DateTime? createdAt;

  @override
  List<Object?> get props => [
    conversationId,
    messageId,
    url,
    sender,
    createdAt,
  ];
}

class ChatSharedContent extends Equatable {
  const ChatSharedContent({
    this.files = const [],
    this.links = const [],
    this.photos = const [],
  });

  factory ChatSharedContent.fromJson(Map<String, dynamic> json) {
    final payload = _mapFromJson(json['sharedContent'] ?? json);
    return ChatSharedContent(
      files: _listFromJson(payload['files'], ChatAttachment.fromJson),
      links: _listFromJson(payload['links'], ChatSharedLink.fromJson),
      photos: _listFromJson(payload['photos'], ChatAttachment.fromJson),
    );
  }

  final List<ChatAttachment> files;
  final List<ChatSharedLink> links;
  final List<ChatAttachment> photos;

  @override
  List<Object?> get props => [files, links, photos];
}
