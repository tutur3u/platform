import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/notifications/widgets/notification_row.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/workspace/widgets/workspace_result_tile.dart';

import 'shell_chrome_scenes.dart';

/// Notifications feed rows grouped under day captions.
class ShellSceneNotificationsBody extends StatelessWidget {
  const ShellSceneNotificationsBody();

  AppNotification _item(
    String id,
    String type,
    String title,
    Duration ago, {
    bool read = false,
  }) => AppNotification(
    id: id,
    userId: 'user-1',
    type: type,
    title: title,
    data: const {},
    createdAt: DateTime.now().subtract(ago),
    readAt: read ? DateTime.now() : null,
  );

  @override
  Widget build(BuildContext context) {
    Widget row(AppNotification n) => NotificationRow(
      notification: n,
      isPending: false,
      openLabel: null,
      onToggleRead: () {},
    );
    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        AppPageInsets.contentBottomClearance(
          context,
          safeBottom: MediaQuery.paddingOf(context).bottom,
        ),
      ),
      children: [
        AppGroupedSection.spaced(
          caption: 'Today',
          dividerInset: notificationDividerInset,
          children: [
            row(
              _item(
                '1',
                'task_mention',
                'Linh mentioned you',
                const Duration(minutes: 5),
              ),
            ),
            row(
              _item(
                '2',
                'task_assigned',
                'Design review assigned',
                const Duration(hours: 2),
              ),
            ),
          ],
        ),
        AppGroupedSection(
          caption: 'Earlier',
          dividerInset: notificationDividerInset,
          children: [
            row(
              _item(
                '3',
                'task_completed',
                'Sprint 24 closed',
                const Duration(days: 3),
                read: true,
              ),
            ),
            row(
              _item(
                '4',
                'system_announcement',
                'Release notes',
                const Duration(days: 6),
                read: true,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// The workspace switcher's rows on the shared sheet surface over the scrim.
class ShellSceneSwitcherSheet extends StatelessWidget {
  const ShellSceneSwitcherSheet();

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final media = MediaQuery.of(context);
    Widget row(Workspace w, {bool selected = false}) => WorkspaceResultTile(
      workspace: w,
      selected: selected,
      current: selected,
      isDefault: false,
      pending: false,
      onSelect: () {},
      onVisibility: null,
      actionLabel: '',
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(color: style.scrim),
        Align(
          alignment: Alignment.bottomCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: AppSheetSurface(
              showHandle: true,
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  16,
                  12,
                  16,
                  media.padding.bottom + 12,
                ),
                child: AppGroupedSection(
                  caption: 'Workspaces',
                  children: [
                    row(sceneWorkspace, selected: true),
                    row(const Workspace(id: 'ws-2', name: 'Personal')),
                    row(const Workspace(id: 'ws-3', name: 'Design team')),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
