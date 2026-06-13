import 'dart:async';

import 'package:flutter/material.dart' hide ButtonStyle;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/mfa_approval/data/mfa_approval_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
  bool _dialogOpen = false;
  bool _foreground = true;
  bool _polling = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncPolling(pollNow: true);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopPolling();
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

    return _foreground &&
        authState.status == AuthStatus.authenticated &&
        (!appLockState.enabled || !appLockState.locked);
  }

  Future<void> _loadPendingApproval() async {
    if (_polling || _dialogOpen || !_shouldPoll()) {
      return;
    }

    _polling = true;
    try {
      final result = await _repository.listPending();
      if (!mounted || !_shouldPoll()) {
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
    final approved = await shad.showDialog<bool>(
      context: context,
      builder: (_) =>
          _MfaApprovalDialog(approval: approval, repository: _repository),
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

class _MfaApprovalDialog extends StatefulWidget {
  const _MfaApprovalDialog({required this.approval, required this.repository});

  final PendingMfaApproval approval;
  final MfaApprovalRepository repository;

  @override
  State<_MfaApprovalDialog> createState() => _MfaApprovalDialogState();
}

class _MfaApprovalDialogState extends State<_MfaApprovalDialog> {
  String? _error;
  bool _approving = false;

  Future<void> _approve() async {
    if (_approving) {
      return;
    }

    setState(() {
      _approving = true;
      _error = null;
    });

    final result = await widget.repository.approve(widget.approval);
    if (!mounted) {
      return;
    }

    if (result.success) {
      Navigator.of(context).pop(true);
      return;
    }

    setState(() {
      _approving = false;
      _error = result.error ?? context.l10n.mfaApprovalFailed;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return AppDialogScaffold(
      title: l10n.mfaApprovalSettingsTitle,
      description: l10n.mfaApprovalDialogDescription,
      icon: Icons.verified_user_outlined,
      maxWidth: 420,
      actions: [
        shad.OutlineButton(
          onPressed: _approving ? null : () => Navigator.of(context).pop(false),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _approving ? null : () => unawaited(_approve()),
          child: _approving
              ? const shad.CircularProgressIndicator(size: 16)
              : Text(l10n.mfaApprovalApproveAction),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            l10n.mfaApprovalPendingDescription(widget.approval.pairCode),
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
            decoration: BoxDecoration(
              border: Border.all(
                color: theme.colorScheme.border.withValues(alpha: 0.8),
              ),
              borderRadius: BorderRadius.circular(18),
              color: theme.colorScheme.card.withValues(alpha: 0.72),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.mfaApprovalPairCodeLabel,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                const shad.Gap(6),
                Text(
                  widget.approval.pairCode,
                  style: theme.typography.h2.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                    fontWeight: FontWeight.w800,
                    letterSpacing: 2,
                  ),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const shad.Gap(12),
            Text(
              _error!,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.destructive,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
