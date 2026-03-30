import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/notifications/widgets/notifications_sheet.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({
    this.initialTab = NotificationsTab.inbox,
    super.key,
  });

  const NotificationsPage.archive({super.key})
    : initialTab = NotificationsTab.archive;

  final NotificationsTab initialTab;

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  late final NotificationsRepository _repository = NotificationsRepository(
    ownsApiClient: true,
  );
  late final NotificationsCubit _cubit;
  StreamSubscription<PushNotificationEvent>? _pushEventsSubscription;

  String? _lastWorkspaceId;

  @override
  void initState() {
    super.initState();
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    _cubit = NotificationsCubit(
      notificationsRepository: _repository,
      initialState: NotificationsCubit.seedStateForWorkspace(
        _scopeWorkspaceIdFor(workspace),
      ),
    );
    _pushEventsSubscription = PushNotificationService.instance.events.listen((
      _,
    ) {
      unawaited(_cubit.refreshUnreadCount());
    });
    unawaited(PushNotificationService.instance.ensurePermissionPrompted());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncWorkspace(context.read<WorkspaceCubit>().state.currentWorkspace);
  }

  @override
  void dispose() {
    unawaited(_pushEventsSubscription?.cancel());
    unawaited(_cubit.close());
    _repository.dispose();
    super.dispose();
  }

  void _syncWorkspace(Workspace? workspace) {
    final nextWorkspaceId = workspace?.id;
    if (_lastWorkspaceId == nextWorkspaceId) {
      return;
    }
    _lastWorkspaceId = nextWorkspaceId;
    unawaited(_cubit.setWorkspace(workspace));
  }

  String? _scopeWorkspaceIdFor(Workspace? workspace) {
    if (workspace == null || workspace.personal) {
      return null;
    }
    return workspace.id;
  }

  Future<void> _archiveAll(BuildContext context) async {
    try {
      await _cubit.markAllRead();
    } on Exception {
      if (!context.mounted) {
        return;
      }
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.notificationsArchiveAllError),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _cubit,
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _syncWorkspace(state.currentWorkspace),
        child: shad.Scaffold(
          child: SafeArea(
            top: false,
            bottom: false,
            child: ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: Stack(
                children: [
                  NotificationsView(
                    parentContext: context,
                    pageMode: true,
                    initialTab: widget.initialTab,
                  ),
                  if (widget.initialTab == NotificationsTab.inbox)
                    BlocBuilder<NotificationsCubit, NotificationsState>(
                      bloc: _cubit,
                      builder: (context, state) {
                        final showArchiveAll = state.unreadCount > 0;
                        return ShellChromeActions(
                          ownerId: 'notifications-root',
                          locations: const {Routes.notifications},
                          actions: showArchiveAll
                              ? [
                                  ShellActionSpec(
                                    id: 'notifications-archive-all',
                                    icon: Icons.archive_outlined,
                                    callbackToken:
                                        'notifications-archive-all:'
                                        '${state.unreadCount}:'
                                        '${state.isArchivingAll}',
                                    tooltip:
                                        context.l10n.notificationsArchiveAll,
                                    isLoading: state.isArchivingAll,
                                    enabled: !state.isArchivingAll,
                                    onPressed: () {
                                      unawaited(_archiveAll(context));
                                    },
                                  ),
                                ]
                              : const [],
                        );
                      },
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
