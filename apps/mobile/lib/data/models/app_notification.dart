import 'package:equatable/equatable.dart';

const _appNotificationSentinel = Object();

class NotificationActor extends Equatable {
  const NotificationActor({
    required this.id,
    this.displayName,
    this.avatarUrl,
  });

  factory NotificationActor.fromJson(Map<String, dynamic> json) {
    return NotificationActor(
      id: json['id'] as String? ?? '',
      displayName: _stringValue(json['display_name']),
      avatarUrl: _stringValue(json['avatar_url']),
    );
  }

  final String id;
  final String? displayName;
  final String? avatarUrl;

  @override
  List<Object?> get props => [id, displayName, avatarUrl];
}

class AppNotification extends Equatable {
  const AppNotification({
    required this.id,
    required this.userId,
    required this.type,
    required this.title,
    required this.data,
    required this.createdAt,
    this.wsId,
    this.description,
    this.entityType,
    this.entityId,
    this.readAt,
    this.createdBy,
    this.actor,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final actorRaw = json['actor'];
    final actorJson = actorRaw is Map<String, dynamic>
        ? actorRaw
        : actorRaw is Map
        ? Map<String, dynamic>.from(actorRaw)
        : null;
    final dataRaw = json['data'];
    final data = dataRaw is Map<String, dynamic>
        ? Map<String, dynamic>.from(dataRaw)
        : dataRaw is Map
        ? Map<String, dynamic>.from(dataRaw)
        : <String, dynamic>{};

    return AppNotification(
      id: json['id'] as String? ?? '',
      wsId: _stringValue(json['ws_id']),
      userId: json['user_id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: _stringValue(json['description']),
      data: data,
      entityType: _stringValue(json['entity_type']),
      entityId: _stringValue(json['entity_id']),
      readAt: _parseDateTime(json['read_at']),
      createdAt: _parseDateTime(json['created_at']) ?? DateTime.now(),
      createdBy: _stringValue(json['created_by']),
      actor: actorJson == null ? null : NotificationActor.fromJson(actorJson),
    );
  }

  final String id;
  final String? wsId;
  final String userId;
  final String type;
  final String title;
  final String? description;
  final Map<String, dynamic> data;
  final String? entityType;
  final String? entityId;
  final DateTime? readAt;
  final DateTime createdAt;
  final String? createdBy;
  final NotificationActor? actor;

  bool get isUnread => readAt == null;

  String? get workspaceId =>
      _stringValue(data['workspace_id']) ?? _stringValue(data['ws_id']) ?? wsId;

  String? get workspaceName => _stringValue(data['workspace_name']);

  String? get boardId =>
      _stringValue(data['board_id']) ?? _stringValue(data['target_board_id']);

  String? get actionTaken => _stringValue(data['action_taken']);

  AppNotification copyWith({
    Map<String, dynamic>? data,
    Object? readAt = _appNotificationSentinel,
  }) {
    return AppNotification(
      id: id,
      wsId: wsId,
      userId: userId,
      type: type,
      title: title,
      description: description,
      data: data ?? this.data,
      entityType: entityType,
      entityId: entityId,
      readAt: readAt == _appNotificationSentinel
          ? this.readAt
          : readAt as DateTime?,
      createdAt: createdAt,
      createdBy: createdBy,
      actor: actor,
    );
  }

  @override
  List<Object?> get props => [
    id,
    wsId,
    userId,
    type,
    title,
    description,
    data,
    entityType,
    entityId,
    readAt,
    createdAt,
    createdBy,
    actor,
  ];
}

class NotificationsPage extends Equatable {
  const NotificationsPage({
    required this.notifications,
    required this.count,
    required this.limit,
    required this.offset,
  });

  factory NotificationsPage.fromJson(Map<String, dynamic> json) {
    final notificationsRaw =
        json['notifications'] as List<dynamic>? ?? const [];

    return NotificationsPage(
      notifications: notificationsRaw
          .whereType<Map<Object?, Object?>>()
          .map(
            (item) => AppNotification.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(growable: false),
      count: json['count'] as int? ?? 0,
      limit: json['limit'] as int? ?? 20,
      offset: json['offset'] as int? ?? 0,
    );
  }

  final List<AppNotification> notifications;
  final int count;
  final int limit;
  final int offset;

  @override
  List<Object?> get props => [notifications, count, limit, offset];
}

DateTime? _parseDateTime(Object? value) {
  final raw = _stringValue(value);
  if (raw == null) {
    return null;
  }

  return DateTime.tryParse(raw)?.toLocal();
}

String? _stringValue(Object? value) {
  if (value is! String) {
    return null;
  }

  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
