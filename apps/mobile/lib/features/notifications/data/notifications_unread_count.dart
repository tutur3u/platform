import 'package:flutter/foundation.dart';

/// App-wide unread notification count for the current actor and workspace.
///
/// Every notifications cubit publishes its count here, so badges outside the
/// inbox (the dock Alerts icon, the top-bar bell) follow reads, mark-all-read
/// and refreshes without owning a cubit of their own.
class NotificationsUnreadCount extends ValueNotifier<int> {
  NotificationsUnreadCount._() : super(0);

  static final NotificationsUnreadCount instance = NotificationsUnreadCount._();

  void publish(int count) => value = count < 0 ? 0 : count;

  @visibleForTesting
  void reset() => value = 0;
}
