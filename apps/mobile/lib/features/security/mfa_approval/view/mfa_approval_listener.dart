import 'dart:async';
import 'package:flutter/material.dart' hide ButtonStyle;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/mfa_approval/data/mfa_approval_repository.dart';
import 'package:mobile/features/security/mfa_approval/view/mfa_approval_dialog.dart';
import 'package:mobile/l10n/l10n.dart';

class MobileMfaApprovalListener extends StatefulWidget {
  const MobileMfaApprovalListener({
    required this.child,
    this.pollInterval = const Duration(seconds: 5),
    this.repository,
    super.key,
  });

  final Widget child;
  final Duration pollInterval;
  final MfaApprovalRepository? repository;

  @override
  State<MobileMfaApprovalListener> createState() =>
      _MobileMfaApprovalListenerState();
}

class _MobileMfaApprovalListenerState extends State<MobileMfaApprovalListener>
    with WidgetsBindingObserver {
  late final MfaApprovalRepository _repository =
      widget.repository ?? MfaApprovalRepository();
  final Set<String> _dismissedChallengeIds = <String>{};
  Timer? _pollTimer;
  StreamSubscription<PushNotificationEvent>? _pushSubscription;
  bool _dialogOpen = false;
  bool _foreground = true;
  bool _polling = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pushSubscription = PushNotificationService.instance.events.listen((event) {
      if (!mounted) return;
      if (event.type == PushNotificationEventType.received &&
          event.request.opensMfaApproval &&
          event.request.userId == context.read<AuthCubit>().state.user?.id) {
        unawaited(_loadPendingApproval());
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncPolling(pollNow: true);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopPolling();
    unawaited(_pushSubscription?.cancel());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;

    if (_foreground) {
      _syncPolling(pollNow: true);
    } else {
      _stopPolling();
    }
  }

  void _syncPolling({bool pollNow = false}) {
    if (!mounted) {
      return;
    }

    if (!_shouldPoll()) {
      _stopPolling();
      return;
    }

    _pollTimer ??= Timer.periodic(
      widget.pollInterval,
      (_) => unawaited(_loadPendingApproval()),
    );

    if (pollNow) {
      unawaited(_loadPendingApproval());
    }
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  bool _shouldPoll() {
    final authState = context.read<AuthCubit>().state;
    final appLockState = context.read<AppLockCubit>().state;

    return GoRouter.maybeOf(
              context,
            )?.routerDelegate.currentConfiguration.uri.path !=
            Routes.settingsMfaApproval &&
        _foreground &&
        authState.status == AuthStatus.authenticated &&
        (!appLockState.enabled || !appLockState.locked);
  }

  Future<void> _loadPendingApproval() async {
    if (_polling || _dialogOpen || !_shouldPoll()) {
      return;
    }

    final userId = context.read<AuthCubit>().state.user?.id;
    _polling = true;
    try {
      final result = await _repository.listPending();
      if (!mounted ||
          !_shouldPoll() ||
          context.read<AuthCubit>().state.user?.id != userId) {
        return;
      }

      final approval = result.approvals
          .where((approval) => !_dismissedChallengeIds.contains(approval.id))
          .where((approval) => approval.expiresAt.isAfter(DateTime.now()))
          .firstOrNull;

      if (approval == null) {
        return;
      }

      await _showApprovalDialog(approval);
    } finally {
      _polling = false;
    }
  }

  Future<void> _showApprovalDialog(PendingMfaApproval approval) async {
    if (_dialogOpen) {
      return;
    }

    final rootNavigator = Navigator.of(context, rootNavigator: true);
    _dialogOpen = true;
    final approved = await showMfaApprovalDialog(
      context,
      approval,
      _repository,
    );

    if (!mounted) {
      return;
    }

    _dialogOpen = false;

    if (approved == true) {
      _dismissedChallengeIds.remove(approval.id);
      if (rootNavigator.context.mounted) {
        shad.showToast(
          context: rootNavigator.context,
          builder: (context, _) => shad.Alert(
            title: Text(context.l10n.mfaApprovalApprovedTitle),
            content: Text(context.l10n.mfaApprovalApprovedDescription),
          ),
        );
      }
      unawaited(_loadPendingApproval());
      return;
    }

    _dismissedChallengeIds.add(approval.id);
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocListener(
      listeners: [
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.status != current.status ||
              previous.user?.id != current.user?.id,
          listener: (_, _) => _syncPolling(pollNow: true),
        ),
        BlocListener<AppLockCubit, AppLockState>(
          listenWhen: (previous, current) =>
              previous.enabled != current.enabled ||
              previous.locked != current.locked,
          listener: (_, _) => _syncPolling(pollNow: true),
        ),
      ],
      child: widget.child,
    );
  }
}
