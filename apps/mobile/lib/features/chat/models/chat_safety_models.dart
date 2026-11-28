part of 'chat_models.dart';

/// Why a chat report is filed, in the order the report sheet lists them.
/// Each name is the wire value of the reports route.
enum ChatReportReason {
  spam,
  harassment,
  hate,
  sexual,
  violence,
  impersonation,
  other,
}

/// What a chat report is about.
enum ChatReportSubjectType { user, message }

/// Someone the viewer blocked, as the blocks route lists them.
class ChatBlockedUser extends Equatable {
  const ChatBlockedUser({
    required this.userId,
    this.displayName,
    this.avatarUrl,
    this.createdAt,
  });

  factory ChatBlockedUser.fromJson(Map<String, dynamic> json) {
    final name = json['displayName']?.toString().trim();
    return ChatBlockedUser(
      userId: json['userId']?.toString() ?? '',
      displayName: name == null || name.isEmpty ? null : name,
      avatarUrl: json['avatarUrl'] as String?,
      createdAt: _dateFromJson(json['createdAt']),
    );
  }

  /// A just-blocked person, before the list is refetched.
  factory ChatBlockedUser.fromProfile(ChatUserProfile user) => ChatBlockedUser(
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: DateTime.now().toUtc(),
  );

  final String userId;
  final String? displayName;
  final String? avatarUrl;
  final DateTime? createdAt;

  @override
  List<Object?> get props => [userId, displayName, avatarUrl, createdAt];
}

/// A report the viewer files from chat. A user report names
/// [reportedUserId]; a message report names [conversationId] and
/// [messageId], and its sender is the reported person.
class ChatReportDraft extends Equatable {
  const ChatReportDraft.user({
    required String this.reportedUserId,
    required this.reason,
    this.details,
    this.alsoBlock = false,
  }) : subjectType = ChatReportSubjectType.user,
       conversationId = null,
       messageId = null;

  const ChatReportDraft.message({
    required String this.conversationId,
    required String this.messageId,
    required this.reason,
    this.details,
    this.alsoBlock = false,
  }) : subjectType = ChatReportSubjectType.message,
       reportedUserId = null;

  /// Longest details text the reports route accepts.
  static const int maxDetailsLength = 1000;

  final ChatReportSubjectType subjectType;
  final String? reportedUserId;
  final String? conversationId;
  final String? messageId;
  final ChatReportReason reason;
  final String? details;
  final bool alsoBlock;

  Map<String, dynamic> toJson() {
    final trimmed = details?.trim() ?? '';
    return {
      'subjectType': subjectType.name,
      if (reportedUserId != null) 'reportedUserId': reportedUserId,
      if (conversationId != null) 'conversationId': conversationId,
      if (messageId != null) 'messageId': messageId,
      'reason': reason.name,
      if (trimmed.isNotEmpty) 'details': trimmed,
      'alsoBlock': alsoBlock,
    };
  }

  @override
  List<Object?> get props => [
    subjectType,
    reportedUserId,
    conversationId,
    messageId,
    reason,
    details,
    alsoBlock,
  ];
}

/// The reports route's answer: the report id and whether it also blocked.
typedef ChatReportReceipt = ({String reportId, bool blocked});
