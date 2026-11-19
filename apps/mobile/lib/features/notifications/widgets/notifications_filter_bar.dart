import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Mutually exclusive All / Unread / Read feed filters. Unread carries the
/// current unread count.
class NotificationsFilterBar extends StatelessWidget {
  const NotificationsFilterBar({
    required this.selected,
    required this.unreadCount,
    required this.onSelected,
    super.key,
  });

  final NotificationsTab selected;
  final int unreadCount;
  final ValueChanged<NotificationsTab> onSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String label(NotificationsTab tab) => switch (tab) {
      NotificationsTab.all => l10n.notificationsFilterAll,
      NotificationsTab.inbox =>
        unreadCount > 0
            ? '${l10n.notificationsFilterUnread} $unreadCount'
            : l10n.notificationsFilterUnread,
      NotificationsTab.archive => l10n.notificationsFilterRead,
    };
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final tab in NotificationsTab.values) ...[
            if (tab != NotificationsTab.values.first)
              const SizedBox(width: AppSpacing.sm),
            AppChip(
              key: ValueKey('notifications-filter-${tab.name}'),
              label: Text(label(tab)),
              selected: tab == selected,
              inMutuallyExclusiveGroup: true,
              onSelected: (_) => onSelected(tab),
            ),
          ],
        ],
      ),
    );
  }
}
