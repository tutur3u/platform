import 'dart:convert';

import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';
import 'package:mobile/features/notifications/push/inbox_push_identity.dart';

/// The only Mastermind locations a push may open: the tab roots.
const Set<String> _mastermindPushRoutes = {
  Routes.mastermind,
  Routes.mastermindInbox,
};

class PushNavigationRequest {
  const PushNavigationRequest({
    required this.notificationId,
    required this.openTarget,
    this.wsId,
    this.entityId,
    this.boardId,
    this.conversationId,
    this.messageId,
    this.mailboxId,
    this.threadId,
    this.userId,
    this.expiresAt,
    this.inboxIdentity,
    this.route,
  });

  final String notificationId;
  final String openTarget;
  final String? wsId;
  final String? entityId;
  final String? boardId;
  final String? conversationId;
  final String? messageId;
  final String? mailboxId;
  final String? threadId;
  final String? userId;
  final DateTime? expiresAt;
  final String? inboxIdentity;
  final String? route;

  MailPushDestination? get mailDestination => openTarget == 'mail'
      ? MailPushDestination.parse({
          'userId': userId,
          'mailboxId': mailboxId,
          'threadId': threadId,
          'notificationId': notificationId,
        })
      : null;

  /// Where a Mastermind push opens: an allowlisted tab root, otherwise the
  /// notifications screen. Null for any other target. The payload route is
  /// never followed unless it exactly matches the allowlist.
  String? get mastermindLocation {
    if (openTarget != 'mastermind') return null;
    final candidate = route;
    return candidate != null && _mastermindPushRoutes.contains(candidate)
        ? candidate
        : Routes.notifications;
  }

  bool get opensMfaApproval =>
      openTarget == 'mfa_approval' && entityId != null && userId != null;

  bool get opensTask =>
      openTarget == 'task' &&
      entityId != null &&
      entityId!.isNotEmpty &&
      boardId != null &&
      boardId!.isNotEmpty;

  bool get opensChat =>
      openTarget == 'chat' &&
      conversationId != null &&
      conversationId!.isNotEmpty;

  bool get hasNavigationMetadata =>
      openTarget == 'mastermind' ||
      notificationId.isNotEmpty ||
      (wsId != null && wsId!.isNotEmpty) ||
      (entityId != null && entityId!.isNotEmpty) ||
      (boardId != null && boardId!.isNotEmpty) ||
      (conversationId != null && conversationId!.isNotEmpty) ||
      (messageId != null && messageId!.isNotEmpty);
}

String? _stringFromPushData(Map<String, dynamic> data, String key) {
  final value = data[key];
  return value is String ? value : null;
}

PushNavigationRequest requestFromPushData(Map<String, dynamic> data) {
  final openTarget = _stringFromPushData(data, 'openTarget') ?? 'inbox';
  final entityId = _stringFromPushData(data, 'entityId');

  return PushNavigationRequest(
    notificationId: _stringFromPushData(data, 'notificationId') ?? '',
    openTarget: openTarget,
    wsId: _stringFromPushData(data, 'wsId'),
    entityId: entityId,
    boardId: _stringFromPushData(data, 'boardId'),
    conversationId:
        _stringFromPushData(data, 'conversationId') ??
        (openTarget == 'chat' ? entityId : null),
    messageId: _stringFromPushData(data, 'messageId'),
    mailboxId: _stringFromPushData(data, 'mailboxId'),
    threadId: _stringFromPushData(data, 'threadId'),
    userId: _stringFromPushData(data, 'userId'),
    expiresAt: DateTime.tryParse(_stringFromPushData(data, 'expiresAt') ?? ''),
    inboxIdentity: InboxPushIdentity.parse(data['inboxIdentity'])?.capsule,
    route: _stringFromPushData(data, 'route'),
  );
}

PushNavigationRequest? requestFromLocalNotificationPayload(String payload) {
  final Object? decoded;
  try {
    decoded = jsonDecode(payload);
  } on FormatException {
    return null;
  }

  if (decoded is! Map<String, dynamic>) {
    return null;
  }

  final request = requestFromPushData(decoded);
  return request.hasNavigationMetadata ? request : null;
}

String? payloadFromPushRequest(PushNavigationRequest request) {
  if (!request.hasNavigationMetadata) {
    return null;
  }

  return jsonEncode({
    'notificationId': request.notificationId,
    'openTarget': request.openTarget,
    'wsId': request.wsId,
    'entityId': request.entityId,
    'boardId': request.boardId,
    'conversationId': request.conversationId,
    'messageId': request.messageId,
    if (InboxPushIdentity.parse(request.inboxIdentity) != null)
      'inboxIdentity': request.inboxIdentity,
    if (request.mailboxId != null) 'mailboxId': request.mailboxId,
    if (request.threadId != null) 'threadId': request.threadId,
    if (request.userId != null) 'userId': request.userId,
    if (request.route != null) 'route': request.route,
    if (request.expiresAt != null)
      'expiresAt': request.expiresAt!.toIso8601String(),
  });
}
