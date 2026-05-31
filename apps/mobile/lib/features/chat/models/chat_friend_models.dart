part of 'chat_models.dart';

class ChatFriendRequest extends Equatable {
  const ChatFriendRequest({
    required this.id,
    required this.requesterUserId,
    required this.recipientUserId,
    required this.requester,
    required this.recipient,
    required this.status,
    this.createdAt,
    this.updatedAt,
    this.respondedAt,
  });

  factory ChatFriendRequest.fromJson(Map<String, dynamic> json) {
    return ChatFriendRequest(
      id: json['id']?.toString() ?? '',
      requesterUserId:
          json['requesterUserId']?.toString() ??
          json['requester_user_id']?.toString() ??
          '',
      recipientUserId:
          json['recipientUserId']?.toString() ??
          json['recipient_user_id']?.toString() ??
          '',
      requester: ChatUserProfile.fromJson(_mapFromJson(json['requester'])),
      recipient: ChatUserProfile.fromJson(_mapFromJson(json['recipient'])),
      status: _friendRequestStatusFromJson(json['status']),
      createdAt: _dateFromJson(json['createdAt'] ?? json['created_at']),
      updatedAt: _dateFromJson(json['updatedAt'] ?? json['updated_at']),
      respondedAt: _dateFromJson(json['respondedAt'] ?? json['responded_at']),
    );
  }

  final String id;
  final String requesterUserId;
  final String recipientUserId;
  final ChatUserProfile requester;
  final ChatUserProfile recipient;
  final ChatFriendRequestStatus status;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? respondedAt;

  @override
  List<Object?> get props => [
    id,
    requesterUserId,
    recipientUserId,
    requester,
    recipient,
    status,
    createdAt,
    updatedAt,
    respondedAt,
  ];
}

class ChatFriendRequests extends Equatable {
  const ChatFriendRequests({
    this.accepted = const [],
    this.incoming = const [],
    this.outgoing = const [],
  });

  factory ChatFriendRequests.fromJson(Map<String, dynamic> json) {
    return ChatFriendRequests(
      accepted: _listFromJson(json['accepted'], ChatFriendRequest.fromJson),
      incoming: _listFromJson(json['incoming'], ChatFriendRequest.fromJson),
      outgoing: _listFromJson(json['outgoing'], ChatFriendRequest.fromJson),
    );
  }

  final List<ChatFriendRequest> accepted;
  final List<ChatFriendRequest> incoming;
  final List<ChatFriendRequest> outgoing;

  @override
  List<Object?> get props => [accepted, incoming, outgoing];
}
