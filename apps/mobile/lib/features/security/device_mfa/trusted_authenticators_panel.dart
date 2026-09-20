import 'package:flutter/material.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as compat;
import 'package:mobile/features/security/device_mfa/device_mfa_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    final confirmed = await compat.showDialog<bool>(
      context: context,
      builder: (context) => compat.AlertDialog(
        title: Text(l10n.deviceMfaRemoveTrusted),
        content: Text('${device.name}\n\n${l10n.deviceMfaRemoveDeviceHint}'),
        actions: [
          shad.OutlineButton(
            alignment: Alignment.center,
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.commonCancel),
          ),
          shad.DestructiveButton(
            alignment: Alignment.center,
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
    final colors = shad.Theme.of(context).colorScheme;
    final hasBackup =
        registry.devices.where((device) => device.verified).length > 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.deviceMfaTrustedTitle,
          style: shad.Theme.of(context).typography.large,
        ),
        const SizedBox(height: 8),
        for (final device in registry.devices)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Icon(
                  device.verified
                      ? Icons.verified_user_outlined
                      : Icons.pending_outlined,
                  size: 20,
                  color: colors.primary,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(device.name),
                      Text(
                        !device.verified
                            ? l10n.deviceMfaPending
                            : device.factorId == currentFactorId
                            ? l10n.deviceMfaCurrentDevice
                            : device.createdAt
                                  .toLocal()
                                  .toString()
                                  .split(' ')
                                  .first,
                        style: shad.Theme.of(context).typography.small.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                if (canManage && device.factorId != currentFactorId)
                  IconButton(
                    tooltip: l10n.deviceMfaRemoveTrusted,
                    onPressed: () => _confirmRemoval(context, device),
                    icon: const Icon(Icons.remove_circle_outline, size: 20),
                  ),
              ],
            ),
          ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.deviceMfaLockTitle),
          subtitle: Text(l10n.deviceMfaLockHint),
          value: registry.locked,
          onChanged: canManage && (registry.locked || hasBackup)
              ? onLockChanged
              : null,
        ),
        Text(
          !registry.locked && !hasBackup
              ? l10n.deviceMfaNeedBackup
              : l10n.deviceMfaLockRecoveryHint,
          style: shad.Theme.of(
            context,
          ).typography.small.copyWith(color: colors.mutedForeground),
        ),
      ],
    );
  }
}
