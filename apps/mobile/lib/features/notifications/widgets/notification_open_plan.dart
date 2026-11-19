import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/notifications/widgets/notification_destination.dart';

/// What tapping a notification does.
sealed class NotificationOpenPlan {
  const NotificationOpenPlan();
}

/// Go to [location], first switching to [switchTo] when the target lives in
/// another workspace.
final class NotificationNavigate extends NotificationOpenPlan {
  const NotificationNavigate(this.location, {this.switchTo});

  final String location;
  final Workspace? switchTo;
}

/// Show the notification itself. [targetUnavailable] is true when it points
/// at an item the app cannot open, such as one in a workspace the user has
/// left.
final class NotificationShowDetails extends NotificationOpenPlan {
  const NotificationShowDetails({required this.targetUnavailable});

  final bool targetUnavailable;
}

/// Notification kinds whose action lives in the row, not behind a target.
const _inlineActionTypes = {'workspace_invite'};

/// Resolves a tap on [notification] against the user's [workspaces].
NotificationOpenPlan planNotificationOpen(
  AppNotification notification, {
  required List<Workspace> workspaces,
  required String? currentWorkspaceId,
}) {
  final location = notificationDestination(notification);
  if (location == null) {
    final pointsAtItem =
        notification.entityType != null &&
        !_inlineActionTypes.contains(notification.type) &&
        !_inlineActionTypes.contains(notification.entityType);
    return NotificationShowDetails(targetUnavailable: pointsAtItem);
  }
  final targetWorkspaceId = notification.workspaceId;
  if (targetWorkspaceId == null || targetWorkspaceId == currentWorkspaceId) {
    return NotificationNavigate(location);
  }
  final target = workspaces
      .where((workspace) => workspace.id == targetWorkspaceId)
      .firstOrNull;
  if (target == null) {
    return const NotificationShowDetails(targetUnavailable: true);
  }
  return NotificationNavigate(location, switchTo: target);
}
