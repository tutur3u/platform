import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/widgets/notifications_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

bool shouldShowNotificationsActionForLocation(String matchedLocation) {
  return matchedLocation == Routes.home ||
      matchedLocation == Routes.assistant ||
      matchedLocation == Routes.apps ||
      matchedLocation == Routes.tasks ||
      matchedLocation == Routes.taskBoards ||
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
      matchedLocation == Routes.timerRequests;
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
  const NotificationsActionButton({
    this.notificationsRepository,
    super.key,
  });

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

  String? _lastWorkspaceId;
  bool get _ownsRepository => widget.notificationsRepository == null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
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

  Future<void> _openSheet() async {
    await showNotificationsSheet(
      context: context,
      notificationsCubit: _notificationsCubit,
    );

    if (!mounted) {
      return;
    }

    unawaited(_notificationsCubit.refreshUnreadCount());
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _notificationsCubit,
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _syncWorkspace(state.currentWorkspace),
        child: BlocBuilder<NotificationsCubit, NotificationsState>(
          builder: (context, state) {
            final unreadCount = state.unreadCount;

            return Semantics(
              button: true,
              label: context.l10n.notificationsTitle,
              child: SizedBox(
                key: const ValueKey('notifications-action-button'),
                width: 40,
                height: 40,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: shad.IconButton.ghost(
                        icon: Icon(
                          unreadCount > 0
                              ? Icons.notifications_active_outlined
                              : Icons.notifications_none_rounded,
                          size: 21,
                        ),
                        onPressed: _openSheet,
                      ),
                    ),
                    if (unreadCount > 0)
                      Positioned(
                        top: 3,
                        right: 4,
                        child: IgnorePointer(
                          child: _UnreadBadge(
                            key: const ValueKey('notifications-unread-badge'),
                            count: unreadCount,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count, super.key});

  final int count;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);
    final label = count > 99 ? '99+' : '$count';

    return Container(
      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: colorScheme.error,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colorScheme.surface, width: 1.5),
      ),
      alignment: Alignment.center,
      child: Text(
        label,
        style: theme.typography.xSmall.copyWith(
          color: colorScheme.onError,
          fontWeight: FontWeight.w700,
          height: 1,
        ),
      ),
    );
  }
}
