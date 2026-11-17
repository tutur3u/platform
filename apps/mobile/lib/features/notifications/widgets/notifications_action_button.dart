import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

bool shouldShowNotificationsActionForLocation(String matchedLocation) {
  return matchedLocation == Routes.home ||
      matchedLocation == Routes.assistant ||
      matchedLocation == Routes.apps ||
      matchedLocation == Routes.profileRoot ||
      matchedLocation == Routes.profileAccounts ||
      matchedLocation == Routes.settingsAccounts ||
      matchedLocation == Routes.tasks ||
      matchedLocation == Routes.taskBoards ||
      matchedLocation == Routes.taskSettings ||
      matchedLocation == Routes.taskPlanning ||
      matchedLocation == Routes.taskEstimates ||
      matchedLocation == Routes.taskPortfolio ||
      matchedLocation == Routes.habits ||
      matchedLocation == Routes.habitsActivity ||
      matchedLocation == Routes.calendar ||
      matchedLocation == Routes.finance ||
      matchedLocation == Routes.transactions ||
      matchedLocation == Routes.categories ||
      matchedLocation == Routes.wallets ||
      matchedLocation == Routes.timer ||
      matchedLocation == Routes.timerHistory ||
      matchedLocation == Routes.timerStats ||
      matchedLocation == Routes.timerRequests ||
      Routes.isSettingsHubLocation(matchedLocation);
}

class ShellNotificationsActionSlot extends StatelessWidget {
  const ShellNotificationsActionSlot({
    required this.matchedLocation,
    this.notificationsRepository,
    super.key,
  });

  final String matchedLocation;
  final NotificationsRepository? notificationsRepository;

  @override
  Widget build(BuildContext context) {
    if (!shouldShowNotificationsActionForLocation(matchedLocation)) {
      return const SizedBox.shrink();
    }

    return NotificationsActionButton(
      notificationsRepository: notificationsRepository,
    );
  }
}

class NotificationsActionButton extends StatefulWidget {
  const NotificationsActionButton({this.notificationsRepository, super.key});

  final NotificationsRepository? notificationsRepository;

  @override
  State<NotificationsActionButton> createState() =>
      _NotificationsActionButtonState();
}

class _NotificationsActionButtonState extends State<NotificationsActionButton>
    with WidgetsBindingObserver {
  late final NotificationsRepository _notificationsRepository =
      widget.notificationsRepository ??
      NotificationsRepository(ownsApiClient: true);
  late final NotificationsCubit _notificationsCubit = NotificationsCubit(
    notificationsRepository: _notificationsRepository,
  );
  StreamSubscription<PushNotificationEvent>? _pushEventsSubscription;

  String? _lastWorkspaceId;
  bool get _ownsRepository => widget.notificationsRepository == null;

  AuthCubit? _authCubitOrNull() {
    try {
      return context.read<AuthCubit?>();
    } on Object {
      return null;
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pushEventsSubscription = PushNotificationService.instance.events.listen((
      _,
    ) {
      unawaited(_notificationsCubit.refreshUnreadCount());
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncWorkspace(context.read<WorkspaceCubit>().state.currentWorkspace);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_notificationsCubit.refreshUnreadCount());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_pushEventsSubscription?.cancel());
    unawaited(_notificationsCubit.close());
    if (_ownsRepository) {
      _notificationsRepository.dispose();
    }
    super.dispose();
  }

  void _syncWorkspace(Workspace? workspace) {
    final nextWorkspaceId = workspace?.id;
    if (_lastWorkspaceId == nextWorkspaceId) {
      return;
    }

    _lastWorkspaceId = nextWorkspaceId;
    unawaited(_notificationsCubit.setWorkspace(workspace));
  }

  Future<void> _openPage() async {
    await PushNotificationService.instance.ensurePermissionPrompted();
    if (!mounted) {
      return;
    }

    await context.push(Routes.notifications);

    if (!mounted) {
      return;
    }

    unawaited(_notificationsCubit.refreshUnreadCount());
  }

  @override
  Widget build(BuildContext context) {
    final authCubit = _authCubitOrNull();
    final notificationsButton =
        BlocBuilder<NotificationsCubit, NotificationsState>(
          builder: (context, state) {
            final unreadCount = state.unreadCount;

            return Semantics(
              button: true,
              label: context.l10n.notificationsTitle,
              value: unreadCount > 0
                  ? context.l10n.notificationsSubtitle(unreadCount)
                  : null,
              excludeSemantics: true,
              onTap: _openPage,
              child: ShellTopBarButton(
                key: const ValueKey('notifications-action-button'),
                icon: const Icon(LucideIcons.bell),
                onPressed: _openPage,
                badge: unreadCount > 0 ? const ShellUnreadDot() : null,
              ),
            );
          },
        );

    return BlocProvider.value(
      value: _notificationsCubit,
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _syncWorkspace(state.currentWorkspace),
        child: authCubit == null
            ? notificationsButton
            : BlocListener<AuthCubit, AuthState>(
                bloc: authCubit,
                listenWhen: (previous, current) =>
                    previous.user?.id != current.user?.id,
                listener: (context, state) {
                  unawaited(_notificationsCubit.refreshUnreadCount());
                },
                child: notificationsButton,
              ),
      ),
    );
  }
}
