import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_cubit.dart';
import 'package:mobile/features/audience_mode/audience_mode_labels.dart';
import 'package:mobile/features/audience_mode/audience_mode_repository.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

/// Settings → Workspace → Mode: this account's mode in the current
/// workspace and, for admins, the default every member starts with.
class SettingsAudienceModeSection extends StatelessWidget {
  const SettingsAudienceModeSection({
    required this.canManageWorkspaceSettings,
    required this.isPersonalWorkspace,
    super.key,
  });

  final bool canManageWorkspaceSettings;
  final bool isPersonalWorkspace;

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<AudienceModeCubit?>();
    final state = cubit?.state;
    final wsId = state?.wsId;
    if (cubit == null || state == null || wsId == null) {
      return const SizedBox.shrink();
    }
    final l10n = context.l10n;
    final layers = state.layers;
    String name(AudienceMode mode) => audienceModeLabel(l10n, mode);
    // Name the layer the "no choice" option falls back to.
    final inherited = resolveAudienceMode(
      workspaceDefault: layers.workspaceDefault,
      account: layers.account,
    );
    final inheritedLabel = switch (inherited.source) {
      AudienceModeSource.workspaceDefault => l10n.settingsModeWorkspaceDefault(
        name(inherited.mode),
      ),
      AudienceModeSource.account => l10n.settingsModeAccountDefault(
        name(inherited.mode),
      ),
      AudienceModeSource.override || AudienceModeSource.fallback =>
        l10n.settingsModeFallbackDefault(name(inherited.mode)),
    };

    return SettingsSection(
      title: l10n.settingsModeTitle,
      description: l10n.settingsModeDescription,
      grouped: true,
      children: [
        PendingSyncFrame(
          workspaceId: wsId,
          entityId: AudienceModeRepository.overridePath(wsId),
          feature: 'audience_mode',
          child: SettingsChoiceRow<AudienceMode?>(
            icon: LucideIcons.layoutDashboard,
            title: l10n.settingsModeMine,
            value: layers.personal,
            options: [
              AppSelectOption(value: null, label: inheritedLabel),
              for (final mode in AudienceMode.values)
                AppSelectOption(
                  value: mode,
                  label: name(mode),
                  description: audienceModeDescription(l10n, mode),
                ),
            ],
            onChanged: (mode) =>
                unawaited(_save(context, () => cubit.setOverride(mode))),
          ),
        ),
        if (canManageWorkspaceSettings && !isPersonalWorkspace)
          SettingsChoiceRow<AudienceMode?>(
            icon: LucideIcons.users,
            title: l10n.settingsModeWorkspaceDefaultTitle,
            subtitle: l10n.settingsModeWorkspaceDefaultSubtitle,
            value: layers.workspaceDefault,
            options: [
              AppSelectOption(value: null, label: l10n.settingsModeNotSet),
              for (final mode in AudienceMode.values)
                AppSelectOption(value: mode, label: name(mode)),
            ],
            onChanged: (mode) => unawaited(
              _save(context, () => cubit.setWorkspaceDefault(mode)),
            ),
          ),
      ],
    );
  }

  Future<void> _save(BuildContext context, Future<void> Function() save) async {
    try {
      await save();
    } on Object {
      if (!context.mounted) return;
      showAppToast(
        context,
        message: context.l10n.settingsModeSaveFailed,
        variant: AppAlertVariant.destructive,
      );
    }
  }
}
