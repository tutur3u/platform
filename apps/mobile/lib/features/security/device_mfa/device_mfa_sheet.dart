import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_panel.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<void> showDeviceMfaSheet(
  BuildContext context, {
  DeviceMfaService? service,
}) async {
  await showAdaptiveSheet<void>(
    context: context,
    useRootNavigator: true,
    maxDialogWidth: 600,
    builder: (context) => _DeviceMfaSheet(service: service),
  );
}

class _DeviceMfaSheet extends StatelessWidget {
  const _DeviceMfaSheet({this.service});
  final DeviceMfaService? service;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final compact = context.isCompact;
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: FractionallySizedBox(
          heightFactor: compact ? 1 : null,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: compact
                  ? double.infinity
                  : MediaQuery.sizeOf(context).height * 0.86,
            ),
            child: Material(
              color: theme.colorScheme.background,
              borderRadius: BorderRadius.circular(compact ? 24 : 20),
              clipBehavior: Clip.antiAlias,
              child: Column(
                mainAxisSize: compact ? MainAxisSize.max : MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 8, 12),
                    child: Row(
                      children: [
                        Icon(
                          Icons.phonelink_lock_rounded,
                          color: theme.colorScheme.primary,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            context.l10n.deviceMfaTitle,
                            style: theme.typography.large,
                          ),
                        ),
                        IconButton(
                          tooltip: context.l10n.deviceMfaClose,
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.close_rounded),
                        ),
                      ],
                    ),
                  ),
                  Divider(height: 1, color: theme.colorScheme.border),
                  Flexible(
                    child: SingleChildScrollView(
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                      child: DeviceMfaPanel(service: service),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
