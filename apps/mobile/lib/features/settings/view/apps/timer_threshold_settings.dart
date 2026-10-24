import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/time_tracker_threshold_cache.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/apps/app_settings_group.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/time_tracker/widgets/threshold_settings_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

/// The missed-entry approval threshold. Shown only for a shared workspace
/// whose member holds both request and workspace-settings rights.
class TimerThresholdSettings extends StatefulWidget {
  const TimerThresholdSettings({
    required this.repository,
    this.permissionsRepository,
    this.cacheStore,
    this.openEditorOnLoad = false,
    super.key,
  });

  final ITimeTrackerRepository repository;
  final WorkspacePermissionsRepository? permissionsRepository;
  final CacheStore? cacheStore;
  final bool openEditorOnLoad;

  @override
  State<TimerThresholdSettings> createState() => _TimerThresholdState();
}

typedef _Threshold = ({int? days, int grace});

class _TimerThresholdState extends State<TimerThresholdSettings> {
  late final WorkspacePermissionsRepository _permissions =
      widget.permissionsRepository ?? WorkspacePermissionsRepository();
  _Threshold? _threshold;
  int _scopeToken = 0;
  late bool _openWhenLoaded = widget.openEditorOnLoad;

  /// Latest save per workspace; earlier saves finishing late never apply.
  final Map<String, int> _saveVersions = {};

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  (String?, String?) _scope() => (
    context.read<AuthCubit>().state.user?.id,
    context.read<WorkspaceCubit>().state.currentWorkspace?.id,
  );

  Future<void> _load() async {
    final token = ++_scopeToken;
    if (_threshold != null) setState(() => _threshold = null);
    final auth = context.read<AuthCubit>().state;
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final userId = auth.user?.id;
    if (auth.status != AuthStatus.authenticated ||
        userId == null ||
        workspace == null ||
        workspace.personal) {
      return;
    }
    try {
      final granted = await _permissions.getPermissions(
        wsId: workspace.id,
        userId: userId,
      );
      if (!granted.containsPermission(manageTimeTrackingRequestsPermission) ||
          !granted.containsPermission(manageWorkspaceSettingsPermission)) {
        return;
      }
      final settings = await widget.repository.getWorkspaceSettings(
        workspace.id,
      );
      final grace = await widget.repository.getWorkspaceConfigValue(
        workspace.id,
        timerStatusChangeGracePeriodConfigId,
      );
      if (!mounted || token != _scopeToken) return;
      final minutes = int.tryParse(grace ?? '0') ?? 0;
      final value = (
        days: settings?.missedEntryDateThreshold,
        grace: minutes < 0 ? 0 : minutes,
      );
      setState(() => _threshold = value);
      if (_openWhenLoaded) {
        _openWhenLoaded = false;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && token == _scopeToken) unawaited(_edit(value));
        });
      }
    } on Exception {
      // A failed or partial load never exposes the managed threshold.
    }
  }

  Future<void> _edit(_Threshold current) async {
    final scope = _scope();
    final token = _scopeToken;
    bool stillCurrent() => mounted && token == _scopeToken && _scope() == scope;
    await showAdaptiveSheet<void>(
      context: context,
      builder: (_) => ThresholdSettingsDialog(
        currentThreshold: current.days,
        currentStatusChangeGracePeriodMinutes: current.grace,
        onSave: (days, grace) async {
          final (userId, workspaceId) = scope;
          if (userId == null || workspaceId == null || !stillCurrent()) return;
          final version = (_saveVersions[workspaceId] ?? 0) + 1;
          _saveVersions[workspaceId] = version;
          bool latest() => _saveVersions[workspaceId] == version;
          try {
            await widget.repository.updateMissedEntryDateThreshold(
              workspaceId,
              days,
              statusChangeGracePeriodMinutes: grace,
            );
            if (!latest()) return;
            try {
              // The write may only be queued offline; publish it so reloads
              // here and on Requests show the saved value, not the old one.
              await cacheSavedMissedEntryThreshold(
                userId: userId,
                workspaceId: workspaceId,
                threshold: days,
                statusChangeGracePeriodMinutes: grace,
                cacheStore: widget.cacheStore,
              );
            } on Object {
              // A cache failure never undoes or repeats the saved write.
            }
            if (!latest() || !stillCurrent()) return;
            setState(() => _threshold = (days: days, grace: grace));
            // Toast from this page: it sits under the root overlay and
            // carries the dock clearance.
            if (!mounted) return;
            _toast(context, (l10n) => l10n.timerRequestsThresholdUpdated);
          } on Object catch (error) {
            if (!latest() || !stillCurrent() || !mounted) return;
            final message = error is ApiException && error.message.isNotEmpty
                ? error.message
                : null;
            _toast(
              context,
              (l10n) => message ?? l10n.commonSomethingWentWrong,
              destructive: true,
            );
          }
        },
      ),
    );
  }

  void _toast(
    BuildContext context,
    String Function(AppLocalizations) text, {
    bool destructive = false,
  }) {
    showAppToast(
      context,
      message: text(context.l10n),
      variant: destructive
          ? AppAlertVariant.destructive
          : AppAlertVariant.neutral,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final threshold = _threshold;
    return MultiBlocListener(
      listeners: [
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id ||
              previous.status != current.status,
          listener: (_, _) => unawaited(_load()),
        ),
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (_, _) => unawaited(_load()),
        ),
      ],
      child: threshold == null
          ? const SizedBox.shrink()
          : Padding(
              padding: const EdgeInsets.only(top: SettingsRowLayout.groupGap),
              child: AppSettingsGroup(
                title: l10n.settingsAppRequestsGroup,
                footer: l10n.settingsFooterWorkspace,
                children: [
                  SettingsTile(
                    key: const ValueKey('settings-request-threshold-row'),
                    grouped: true,
                    icon: LucideIcons.clipboardCheck,
                    title: l10n.settingsApprovalThreshold,
                    value: threshold.days == null
                        ? l10n.timerRequestsThresholdNoApproval
                        : l10n.settingsRequestThresholdSummary(threshold.days!),
                    onTap: () => unawaited(_edit(threshold)),
                  ),
                ],
              ),
            ),
    );
  }
}
