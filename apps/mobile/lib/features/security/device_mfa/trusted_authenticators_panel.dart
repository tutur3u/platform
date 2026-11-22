import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_repository.dart';
import 'package:mobile/features/security/presentation/security_labels.dart';
import 'package:mobile/features/security/presentation/session_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

class TrustedAuthenticatorsPanel extends StatelessWidget {
  const TrustedAuthenticatorsPanel({
    required this.registry,
    required this.currentFactorId,
    required this.canManage,
    required this.onLockChanged,
    required this.onRemove,
    super.key,
  });
  final DeviceMfaRegistry registry;
  final String? currentFactorId;
  final bool canManage;
  final ValueChanged<bool> onLockChanged;
  final ValueChanged<String> onRemove;

  Future<void> _confirmRemoval(
    BuildContext context,
    TrustedAuthenticator device,
  ) async {
    final l10n = context.l10n;
    final confirmed = await showAppDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: l10n.deviceMfaRemoveTrustedConfirmTitle(device.name),
        content: Text(l10n.deviceMfaRemoveDeviceHint),
        actions: [
          AppButton.outline(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.commonCancel),
          ),
          AppButton.destructive(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l10n.deviceMfaRemoveTrusted),
          ),
        ],
      ),
    );
    if (confirmed == true && context.mounted) onRemove(device.factorId);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hasBackup =
        registry.devices.where((device) => device.verified).length > 1;
    final canToggleLock = canManage && (registry.locked || hasBackup);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppGroupedSection.spaced(
          caption: l10n.deviceMfaTrustedTitle,
          captionTrailing: Text(
            '${registry.devices.length}',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          children: [
            for (final device in registry.devices)
              _TrustedDeviceRow(
                device: device,
                current: device.factorId == currentFactorId,
                onRemove: canManage && device.factorId != currentFactorId
                    ? () => _confirmRemoval(context, device)
                    : null,
              ),
          ],
        ),
        AppGroupedSection(
          caption: l10n.deviceMfaRegistrationSection,
          children: [
            Semantics(
              toggled: registry.locked,
              enabled: canToggleLock,
              child: AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.lock),
                title: Text(l10n.deviceMfaLockTitle),
                subtitle: Text(l10n.deviceMfaLockHint),
                onTap: canToggleLock
                    ? () => onLockChanged(!registry.locked)
                    : null,
                // The row owns focus and activation; the switch only shows
                // the state, so keyboard users get one stop.
                trailing: ExcludeFocus(
                  child: ExcludeSemantics(
                    child: IgnorePointer(
                      child: AppSwitch(
                        value: registry.locked,
                        onChanged: canToggleLock ? (_) {} : null,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        AppAlert(
          variant: AppAlertVariant.warning,
          title: Text(l10n.deviceMfaBackupCalloutTitle),
          content: Text(
            !registry.locked && !hasBackup
                ? l10n.deviceMfaNeedBackup
                : l10n.deviceMfaLockRecoveryHint,
          ),
        ),
      ],
    );
  }
}

class _TrustedDeviceRow extends StatelessWidget {
  const _TrustedDeviceRow({
    required this.device,
    required this.current,
    required this.onRemove,
  });

  final TrustedAuthenticator device;
  final bool current;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    return AppGroupedRow(
      leading: AppIconTile(
        icon: securityDeviceIcon(authenticatorDeviceKind(device.name)),
        tone: current && device.verified ? AppTone.success : AppTone.neutral,
      ),
      title: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.xxs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(device.name),
          if (!device.verified)
            AppBadge(
              variant: AppBadgeVariant.warning,
              child: Text(l10n.deviceMfaPending),
            )
          else if (current)
            AppBadge(
              variant: AppBadgeVariant.success,
              child: Text(l10n.deviceMfaCurrentDevice),
            ),
        ],
      ),
      subtitle: Text(
        l10n.deviceMfaAddedOn(securityDate(context, device.createdAt)),
      ),
      trailing: onRemove == null
          ? null
          : AppIconButton(
              tooltip: l10n.deviceMfaRemoveTrustedNamed(device.name),
              onPressed: onRemove,
              icon: Icon(LucideIcons.trash2, size: 18, color: c.destructive),
            ),
    );
  }
}
