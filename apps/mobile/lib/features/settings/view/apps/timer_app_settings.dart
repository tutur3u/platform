import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/apps/app_settings_labels.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/time_tracker/widgets/pomodoro_settings_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/threshold_settings_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Workspace config read beside the approval threshold.
const timerStatusChangeGracePeriodConfigId =
    'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES';

/// Timer: device Pomodoro lengths and, for workspace managers, the missed
/// entry approval threshold. The threshold row appears only for a shared
/// workspace whose member holds both request and workspace-settings rights.
class TimerAppSettings extends StatefulWidget {
  const TimerAppSettings({
    this.repository,
    this.permissionsRepository,
    this.cacheStore,
    super.key,
  });

  final ITimeTrackerRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;
  final CacheStore? cacheStore;

  @override
  State<TimerAppSettings> createState() => _TimerAppSettingsState();
}

class _ThresholdState {
  const _ThresholdState({required this.threshold, required this.grace});
  final int? threshold;
  final int grace;
}

class _TimerAppSettingsState extends State<TimerAppSettings> {
  late final ITimeTrackerRepository _repository =
      widget.repository ?? TimeTrackerRepository();
  late final WorkspacePermissionsRepository _permissions =
      widget.permissionsRepository ?? WorkspacePermissionsRepository();
  PomodoroSettings? _pomodoro;
  _ThresholdState? _threshold;
  int _scopeToken = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_loadPomodoro());
    unawaited(_loadThreshold());
  }

  Future<void> _loadPomodoro() async {
    final settings = await _repository.loadPomodoroSettings();
    if (mounted) setState(() => _pomodoro = settings);
  }

  (String?, String?) _scope() => (
    context.read<AuthCubit>().state.user?.id,
    context.read<WorkspaceCubit>().state.currentWorkspace?.id,
  );

  Future<void> _loadThreshold() async {
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
      final permissions = await _permissions.getPermissions(
        wsId: workspace.id,
        userId: userId,
      );
      if (!permissions.containsPermission(
            manageTimeTrackingRequestsPermission,
          ) ||
          !permissions.containsPermission(manageWorkspaceSettingsPermission)) {
        return;
      }
      final settings = await _repository.getWorkspaceSettings(workspace.id);
      final grace = await _repository.getWorkspaceConfigValue(
        workspace.id,
        timerStatusChangeGracePeriodConfigId,
      );
      if (!mounted || token != _scopeToken) return;
      final minutes = int.tryParse(grace ?? '0') ?? 0;
      setState(
        () => _threshold = _ThresholdState(
          threshold: settings?.missedEntryDateThreshold,
          grace: minutes < 0 ? 0 : minutes,
        ),
      );
    } on Exception {
      // A failed or partial load never exposes the managed threshold.
    }
  }

  Future<void> _editPomodoro(PomodoroSettings current) async {
    await showAdaptiveSheet<void>(
      useRootNavigator: true,
      context: context,
      builder: (_) => PomodoroSettingsDialog(
        settings: current,
        onSave: (settings) => unawaited(_savePomodoro(settings)),
      ),
    );
  }

  Future<void> _savePomodoro(PomodoroSettings settings) async {
    await _repository.savePomodoroSettings(settings);
    if (mounted) setState(() => _pomodoro = settings);
  }

  Future<void> _editThreshold(_ThresholdState current) async {
    final scope = _scope();
    final token = _scopeToken;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    bool stillCurrent() => mounted && token == _scopeToken && _scope() == scope;
    await showAdaptiveSheet<void>(
      context: context,
      builder: (_) => ThresholdSettingsDialog(
        currentThreshold: current.threshold,
        currentStatusChangeGracePeriodMinutes: current.grace,
        onSave: (threshold, grace) async {
          final workspaceId = scope.$2;
          if (workspaceId == null || !stillCurrent()) return;
          try {
            await _repository.updateMissedEntryDateThreshold(
              workspaceId,
              threshold,
              statusChangeGracePeriodMinutes: grace,
            );
            // Workspace settings reads are cached; drop them so the Requests
            // page reloads the saved threshold instead of the old one.
            try {
              await (widget.cacheStore ?? CacheStore.instance).invalidateTags({
                'module:time_tracker',
              }, workspaceId: workspaceId);
            } on Object {
              // A cache failure never undoes or repeats the saved write.
            }
            if (!stillCurrent()) return;
            setState(
              () => _threshold = _ThresholdState(
                threshold: threshold,
                grace: grace,
              ),
            );
            if (!toastContext.mounted) return;
            _toast(toastContext, (l10n) => l10n.timerRequestsThresholdUpdated);
          } on Object catch (error) {
            if (!stillCurrent() || !toastContext.mounted) return;
            final message = error is ApiException && error.message.isNotEmpty
                ? error.message
                : null;
            _toast(
              toastContext,
              (l10n) => message ?? l10n.commonSomethingWentWrong,
              destructive: true,
            );
          }
        },
      ),
    );
  }

  void _toast(
    BuildContext toastContext,
    String Function(AppLocalizations) text, {
    bool destructive = false,
  }) {
    shad.showToast(
      context: toastContext,
      builder: (context, _) => destructive
          ? shad.Alert.destructive(content: Text(text(context.l10n)))
          : shad.Alert(content: Text(text(context.l10n))),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final pomodoro = _pomodoro;
    final threshold = _threshold;
    return MultiBlocListener(
      listeners: [
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id ||
              previous.status != current.status,
          listener: (_, _) => unawaited(_loadThreshold()),
        ),
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (_, _) => unawaited(_loadThreshold()),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SettingsCompactSection(
            title: l10n.settingsAppFocusGroup,
            children: [
              SettingsTile(
                key: const ValueKey('settings-pomodoro-row'),
                grouped: true,
                icon: shad.LucideIcons.timer,
                title: l10n.timerPomodoroSettings,
                value: pomodoro == null
                    ? l10n.commonLoading
                    : pomodoroSummary(pomodoro, l10n),
                onTap: pomodoro == null
                    ? null
                    : () => unawaited(_editPomodoro(pomodoro)),
              ),
            ],
          ),
          if (threshold != null) ...[
            const SizedBox(height: SettingsRowLayout.groupGap),
            SettingsCompactSection(
              title: l10n.settingsAppRequestsGroup,
              children: [
                SettingsTile(
                  key: const ValueKey('settings-request-threshold-row'),
                  grouped: true,
                  icon: shad.LucideIcons.clipboardCheck,
                  title: l10n.timerRequestsThresholdTitle,
                  value: threshold.threshold == null
                      ? l10n.timerRequestsThresholdNoApproval
                      : l10n.settingsRequestThresholdSummary(
                          threshold.threshold!,
                        ),
                  onTap: () => unawaited(_editThreshold(threshold)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
