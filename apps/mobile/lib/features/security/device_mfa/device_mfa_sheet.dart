import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_panel.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> showDeviceMfaSheet(
  BuildContext context, {
  DeviceMfaService? service,
}) async {
  final busy = ValueNotifier(false);
  var active = true;
  try {
    await showAdaptiveSheet<void>(
      context: context,
      useRootNavigator: true,
      maxDialogWidth: 640,
      enableDrag: false,
      backgroundColor: AppTokens.of(context).colorScheme.background,
      builder: (context) => ValueListenableBuilder<bool>(
        valueListenable: busy,
        builder: (context, isBusy, _) => PopScope(
          canPop: !isBusy,
          child: _DeviceMfaSheet(
            service: service,
            busy: isBusy,
            onBusyChanged: (value) {
              if (active) busy.value = value;
            },
          ),
        ),
      ),
    );
  } finally {
    active = false;
    busy.dispose();
  }
}

class _DeviceMfaSheet extends StatelessWidget {
  const _DeviceMfaSheet({
    required this.busy,
    required this.onBusyChanged,
    this.service,
  });
  final bool busy;
  final ValueChanged<bool> onBusyChanged;
  final DeviceMfaService? service;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
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
              color: tokens.colorScheme.background,
              borderRadius: BorderRadius.circular(compact ? 24 : 20),
              clipBehavior: Clip.antiAlias,
              child: Column(
                mainAxisSize: compact ? MainAxisSize.max : MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsetsDirectional.fromSTEB(
                      AppSpacing.xl,
                      AppSpacing.md,
                      AppSpacing.sm,
                      AppSpacing.md,
                    ),
                    child: Row(
                      children: [
                        const AppIconTile(
                          icon: LucideIcons.smartphone,
                          tone: AppTone.success,
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Semantics(
                            header: true,
                            child: Text(
                              context.l10n.deviceMfaTitle,
                              style: tokens.typography.large.copyWith(
                                fontWeight: FontWeight.w700,
                                color: tokens.colorScheme.foreground,
                              ),
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: context.l10n.deviceMfaClose,
                          onPressed: busy
                              ? null
                              : () => Navigator.of(context).maybePop(),
                          icon: const Icon(LucideIcons.x, size: 20),
                        ),
                      ],
                    ),
                  ),
                  Divider(height: 1, color: tokens.colorScheme.border),
                  Flexible(
                    child: SingleChildScrollView(
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.xl,
                        AppSpacing.xs,
                        AppSpacing.xl,
                        AppSpacing.xxl,
                      ),
                      child: DeviceMfaPanel(
                        service: service,
                        onBusyChanged: onBusyChanged,
                      ),
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
