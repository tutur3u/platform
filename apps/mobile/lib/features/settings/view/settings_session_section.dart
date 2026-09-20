import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_sheet.dart';
import 'package:mobile/features/security/mfa_approval/data/mfa_approval_repository.dart';
import 'package:mobile/features/security/mfa_approval/view/mfa_approval_dialog.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SessionSettingsSection extends StatefulWidget {
  const SessionSettingsSection({required this.onSignOut, super.key});

  final VoidCallback onSignOut;

  @override
  State<SessionSettingsSection> createState() => _SessionSettingsSectionState();
}

class _SessionSettingsSectionState extends State<SessionSettingsSection> {
  late final MfaApprovalRepository _mfaApprovalRepository;
  Timer? _pollTimer;
  List<PendingMfaApproval> _pendingApprovals = const [];
  String? _approvalError;
  String? _approvingChallengeId;
  bool _approvalLoading = true;
  bool _approvalRefreshing = false;
  bool _requiresMobileMfa = false;

  @override
  void initState() {
    super.initState();
    _mfaApprovalRepository = MfaApprovalRepository();
    unawaited(_loadPendingApprovals());
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      unawaited(_loadPendingApprovals(silent: true));
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadPendingApprovals({bool silent = false}) async {
    if (_approvalRefreshing) {
      return;
    }

    _approvalRefreshing = true;
    if (!silent && mounted) {
      setState(() {
        _approvalLoading = true;
      });
    }

    final result = await _mfaApprovalRepository.listPending();
    if (!mounted) {
      _approvalRefreshing = false;
      return;
    }

    setState(() {
      _pendingApprovals = result.approvals;
      _requiresMobileMfa = result.requiresMobileMfa;
      _approvalError = result.error;
      _approvalLoading = false;
      _approvalRefreshing = false;
    });
  }

  Future<void> _approveMfaRequest(PendingMfaApproval approval) async {
    if (_approvingChallengeId != null) {
      return;
    }

    setState(() {
      _approvingChallengeId = approval.id;
      _approvalError = null;
    });

    final approved = await showMfaApprovalDialog(
      context,
      approval,
      _mfaApprovalRepository,
    );
    if (!mounted) {
      return;
    }

    if (approved == true) {
      _showToast(
        title: context.l10n.mfaApprovalApprovedTitle,
        description: context.l10n.mfaApprovalApprovedDescription,
      );
      setState(() {
        _approvingChallengeId = null;
      });
      unawaited(_loadPendingApprovals(silent: true));
      return;
    }

    setState(() {
      _approvingChallengeId = null;
      _approvalError = null;
    });
  }

  void _showToast({required String title, required String description}) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) {
      return;
    }

    shad.showToast(
      context: toastContext,
      builder: (context, _) =>
          shad.Alert(title: Text(title), content: Text(description)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final appLockState = context.watch<AppLockCubit>().state;
    final appLockEnabled = appLockState.enabled;
    final pendingApproval = _pendingApprovals.isEmpty
        ? null
        : _pendingApprovals.first;

    return SettingsSection(
      title: l10n.settingsDangerSectionTitle,
      description: l10n.settingsDangerSectionDescription,
      children: [
        SettingsTile(
          icon: Icons.phonelink_lock_rounded,
          title: l10n.deviceMfaTitle,
          subtitle: l10n.deviceMfaDescription,
          onTap: () => unawaited(showDeviceMfaSheet(context)),
        ),
        SettingsTile(
          icon: Icons.devices_rounded,
          title: l10n.securitySessionsTitle,
          subtitle: l10n.securitySessionsDescription,
          onTap: () => context.push(Routes.settingsAccountSecurity),
        ),
        SettingsTile(
          icon: Icons.lock_outline_rounded,
          title: l10n.appLockSettingsTitle,
          subtitle: appLockState.status == AppLockStatus.unavailable
              ? l10n.appLockUnavailableDescription
              : l10n.appLockSettingsDescription,
          value: appLockEnabled
              ? l10n.appLockSettingsEnabled
              : l10n.appLockSettingsDisabled,
          showChevron: false,
          trailing: IgnorePointer(
            child: shad.Switch(value: appLockEnabled, onChanged: (_) {}),
          ),
          onTap: () {
            final nextValue = !appLockEnabled;
            unawaited(
              context.read<AppLockCubit>().setEnabled(
                enabled: nextValue,
                reason: nextValue
                    ? l10n.appLockEnableReason
                    : l10n.appLockDisableReason,
              ),
            );
          },
        ),
        SettingsTile(
          icon: Icons.qr_code_scanner_rounded,
          title: l10n.qrLoginSettingsTitle,
          subtitle: l10n.qrLoginSettingsDescription,
          onTap: () => context.push(Routes.settingsQrLoginScan),
        ),
        SettingsTile(
          icon: Icons.verified_user_outlined,
          title: l10n.mfaApprovalSettingsTitle,
          subtitle: pendingApproval != null
              ? l10n.deviceMfaReview
              : _requiresMobileMfa
              ? l10n.mfaApprovalRequiresMobileMfa
              : _approvalError ?? l10n.mfaApprovalSettingsIdle,
          showChevron: false,
          trailing: pendingApproval != null
              ? shad.PrimaryButton(
                  enabled: _approvingChallengeId == null,
                  size: shad.ButtonSize.small,
                  onPressed: () =>
                      unawaited(_approveMfaRequest(pendingApproval)),
                  child: _approvingChallengeId == pendingApproval.id
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: NovaLoadingIndicator(size: 20),
                        )
                      : Text(l10n.deviceMfaReview),
                )
              : (_approvalLoading || _approvalRefreshing)
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: NovaLoadingIndicator(size: 20),
                )
              : null,
          onTap: pendingApproval != null
              ? () => unawaited(_approveMfaRequest(pendingApproval))
              : null,
        ),
        SettingsTile(
          icon: Icons.logout_rounded,
          title: l10n.authLogOutCurrent,
          subtitle: l10n.authLogOutCurrentDescription,
          isDestructive: true,
          onTap: widget.onSignOut,
        ),
      ],
    );
  }
}
