import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_sheet.dart';
import 'package:mobile/features/security/mfa_approval/data/mfa_approval_repository.dart';
import 'package:mobile/features/security/mfa_approval/view/mfa_approval_dialog.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Content width of the security hub: the detail page kind's expanded width
/// minus its gutters, so desktop rows keep their controls near their labels.
final double _hubMaxWidth =
    AppLayout.maxContentWidth(AppPageKind.detail, DeviceClass.expanded)! -
    2 * AppLayout.gutter(DeviceClass.expanded);

class SessionSettingsSection extends StatefulWidget {
  const SessionSettingsSection({
    required this.onSignOut,
    this.mfaApprovalRepository,
    super.key,
  });

  final VoidCallback onSignOut;

  /// Pending web MFA approvals. Tests inject it; the app builds the default.
  final MfaApprovalRepository? mfaApprovalRepository;

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
    _mfaApprovalRepository =
        widget.mfaApprovalRepository ?? MfaApprovalRepository();
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

  void _toggleAppLock(bool enabled) {
    final l10n = context.l10n;
    final nextValue = !enabled;
    unawaited(
      context.read<AppLockCubit>().setEnabled(
        enabled: nextValue,
        reason: nextValue
            ? l10n.appLockEnableReason
            : l10n.appLockDisableReason,
      ),
    );
  }

  Future<void> _chooseAppLockDelay(AppLockDelay current) async {
    final l10n = context.l10n;
    final cubit = context.read<AppLockCubit>();
    final selected = await showAppChoiceSheet<AppLockDelay>(
      context: context,
      title: l10n.appLockDelayTitle,
      selected: current,
      choices: [
        for (final delay in AppLockDelay.values)
          AppSheetChoice(
            value: delay,
            label: _appLockDelayLabel(context, delay),
          ),
      ],
    );
    if (selected != null) await cubit.setDelay(selected);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final appLockState = context.watch<AppLockCubit>().state;
    final appLockEnabled = appLockState.enabled;

    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: _hubMaxWidth),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SettingsSection(
              title: l10n.securityHubSignInSection,
              grouped: true,
              children: [
                SettingsTile(
                  grouped: true,
                  icon: LucideIcons.smartphone,
                  title: l10n.deviceMfaTitle,
                  subtitle: l10n.deviceMfaHubSubtitle,
                  onTap: () => unawaited(showDeviceMfaSheet(context)),
                ),
                SettingsTile(
                  grouped: true,
                  icon: LucideIcons.monitorSmartphone,
                  title: l10n.securitySessionsTitle,
                  subtitle: l10n.securitySessionsHubSubtitle,
                  onTap: () => context.push(Routes.settingsAccountSecurity),
                ),
              ],
            ),
            const SizedBox(height: SettingsRowLayout.groupGap),
            SettingsSection(
              title: l10n.securityHubProtectionSection,
              grouped: true,
              children: [
                Semantics(
                  toggled: appLockEnabled,
                  child: SettingsTile(
                    grouped: true,
                    icon: LucideIcons.lock,
                    title: l10n.appLockSettingsTitle,
                    subtitle: appLockState.status != AppLockStatus.unavailable
                        ? l10n.appLockHubSubtitle
                        : appLockState.error == appLockSaveFailedError
                        ? l10n.appLockSaveFailedDescription
                        : l10n.appLockUnavailableDescription,
                    showChevron: false,
                    trailingWidth: 60,
                    // The row owns focus and activation; the switch only
                    // shows the state, so keyboard users get one stop.
                    trailing: ExcludeFocus(
                      child: ExcludeSemantics(
                        child: IgnorePointer(
                          child: AppSwitch(
                            value: appLockEnabled,
                            onChanged: (_) {},
                          ),
                        ),
                      ),
                    ),
                    onTap: () => _toggleAppLock(appLockEnabled),
                  ),
                ),
                if (appLockEnabled)
                  SettingsTile(
                    grouped: true,
                    icon: LucideIcons.timer,
                    title: l10n.appLockDelayTitle,
                    trailingValue: _appLockDelayLabel(
                      context,
                      appLockState.delay,
                    ),
                    onTap: () =>
                        unawaited(_chooseAppLockDelay(appLockState.delay)),
                  ),
              ],
            ),
            const SizedBox(height: SettingsRowLayout.groupGap),
            SettingsSection(
              title: l10n.securityHubOtherSection,
              grouped: true,
              children: [
                SettingsTile(
                  grouped: true,
                  icon: LucideIcons.scanQrCode,
                  title: l10n.qrLoginSettingsTitle,
                  subtitle: l10n.qrLoginHubSubtitle,
                  onTap: () => context.push(Routes.settingsQrLoginScan),
                ),
                _buildMfaApprovalTile(context),
              ],
            ),
            const SizedBox(height: SettingsRowLayout.groupGap),
            SettingsGroup(
              children: [
                SettingsTile(
                  grouped: true,
                  icon: LucideIcons.logOut,
                  title: l10n.authLogOutCurrent,
                  isDestructive: true,
                  showChevron: false,
                  onTap: widget.onSignOut,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMfaApprovalTile(BuildContext context) {
    final l10n = context.l10n;
    final pendingApproval = _pendingApprovals.isEmpty
        ? null
        : _pendingApprovals.first;
    final busy = _approvalLoading || _approvalRefreshing;
    if (pendingApproval != null) {
      return SettingsTile(
        grouped: true,
        icon: LucideIcons.shieldCheck,
        title: l10n.mfaApprovalSettingsTitle,
        badge: l10n.mfaApprovalPendingCount(_pendingApprovals.length),
        // The pair code is read from the requesting device in the approval
        // dialog, so the hub never repeats it.
        subtitle: l10n.deviceMfaReview,
        showChevron: false,
        trailingWidth: 96,
        trailing: AppButton.primary(
          size: AppButtonSize.small,
          loading: _approvingChallengeId == pendingApproval.id,
          semanticLabel: l10n.deviceMfaReview,
          onPressed: _approvingChallengeId == null
              ? () => unawaited(_approveMfaRequest(pendingApproval))
              : null,
          child: Text(l10n.mfaApprovalReviewAction),
        ),
        onTap: _approvingChallengeId == null
            ? () => unawaited(_approveMfaRequest(pendingApproval))
            : null,
      );
    }
    return SettingsTile(
      grouped: true,
      icon: LucideIcons.shieldCheck,
      title: l10n.mfaApprovalSettingsTitle,
      subtitle: _requiresMobileMfa
          ? l10n.mfaApprovalRequiresMobileMfa
          : _approvalError ?? l10n.mfaApprovalSettingsIdle,
      // This row has no action of its own, so its explanation always wraps
      // in place and never collapses into a tap-only details link.
      wrapSupportingText: true,
      showChevron: false,
      trailing: busy ? const AppLoadingIndicator.inline() : null,
    );
  }
}

String _appLockDelayLabel(BuildContext context, AppLockDelay delay) {
  final l10n = context.l10n;
  return switch (delay) {
    AppLockDelay.immediately => l10n.appLockDelayImmediately,
    AppLockDelay.after30Seconds => l10n.appLockDelay30Seconds,
    AppLockDelay.after1Minute => l10n.appLockDelay1Minute,
    AppLockDelay.after5Minutes => l10n.appLockDelay5Minutes,
  };
}
