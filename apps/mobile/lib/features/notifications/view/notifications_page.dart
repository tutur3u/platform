import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/notifications/widgets/notification_inbox_actions.dart';
import 'package:mobile/features/notifications/widgets/notifications_inbox.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Alerts root tab: the notifications inbox with All / Unread / Read
/// filters, plus Mark all as read and notification settings in the top bar.
class NotificationsPage extends StatefulWidget {
  const NotificationsPage({
    this.initialTab = NotificationsTab.all,
    this.repository,
    this.now,
    super.key,
  });

  const NotificationsPage.archive({super.key})
    : initialTab = NotificationsTab.archive,
      repository = null,
      now = null;

  final NotificationsTab initialTab;

  /// Caller-owned repository for render tests; the page disposes only the
  /// repository it creates.
  @visibleForTesting
  final NotificationsRepository? repository;

  /// Fixed clock for day grouping in render tests.
  @visibleForTesting
  final DateTime? now;

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  late final NotificationsRepository _repository =
      widget.repository ?? NotificationsRepository(ownsApiClient: true);
  late final NotificationsCubit _cubit;
  late final NotificationInboxActions _actions;
  late NotificationsTab _tab = widget.initialTab;
  String? _lastWorkspaceId;

  @override
  void initState() {
    super.initState();
    final workspaceCubit = context.read<WorkspaceCubit>();
    _cubit = NotificationsCubit(
      notificationsRepository: _repository,
      initialState: NotificationsCubit.seedStateForWorkspace(
        _scopeWorkspaceIdFor(workspaceCubit.state.currentWorkspace),
      ),
    );
    _actions = NotificationInboxActions(
      cubit: _cubit,
      workspaceCubit: workspaceCubit,
      navigate: (location) {
        if (mounted) context.go(location);
      },
    );
    unawaited(PushNotificationService.instance.ensurePermissionPrompted());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncWorkspace(context.read<WorkspaceCubit>().state.currentWorkspace);
  }

  @override
  void dispose() {
    unawaited(_cubit.close());
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  void _syncWorkspace(Workspace? workspace) {
    if (_lastWorkspaceId == workspace?.id) return;
    _lastWorkspaceId = workspace?.id;
    unawaited(_cubit.setWorkspace(workspace));
  }

  static String? _scopeWorkspaceIdFor(Workspace? workspace) =>
      workspace == null || workspace.personal ? null : workspace.id;

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _cubit,
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _syncWorkspace(state.currentWorkspace),
        child: AppScaffold(
          child: Stack(
            children: [
              NotificationsInbox(
                actions: _actions,
                tab: _tab,
                now: widget.now,
                onTabChanged: (tab) => setState(() => _tab = tab),
              ),
              BlocBuilder<NotificationsCubit, NotificationsState>(
                bloc: _cubit,
                buildWhen: (previous, current) =>
                    previous.unreadCount != current.unreadCount ||
                    previous.isArchivingAll != current.isArchivingAll,
                builder: (context, state) => ShellChromeActions(
                  ownerId: 'notifications-root',
                  onResetSection: () =>
                      setState(() => _tab = NotificationsTab.all),
                  locations: const {
                    Routes.notifications,
                    Routes.notificationsArchive,
                  },
                  actions: [
                    // Offered only when it can act, never as a disabled
                    // control on an empty inbox.
                    if (state.unreadCount > 0 || state.isArchivingAll)
                      ShellActionSpec(
                        id: 'notifications-mark-all-read',
                        icon: LucideIcons.checkCheck,
                        callbackToken:
                            'notifications-mark-all-read:'
                            '${state.unreadCount}:${state.isArchivingAll}',
                        tooltip: context.l10n.notificationsMarkAllRead,
                        isLoading: state.isArchivingAll,
                        enabled: !state.isArchivingAll,
                        onPressed: () =>
                            unawaited(_actions.markAllRead(context)),
                      ),
                    ShellActionSpec(
                      id: 'notifications-settings',
                      icon: LucideIcons.settings2,
                      tooltip: context.l10n.notificationsSettings,
                      onPressed: () =>
                          unawaited(context.push(Routes.settingsReminders)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
