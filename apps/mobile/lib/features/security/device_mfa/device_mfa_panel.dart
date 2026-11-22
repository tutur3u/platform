import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_error.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_repository.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_status_card.dart';
import 'package:mobile/features/security/device_mfa/trusted_authenticators_panel.dart';
import 'package:mobile/l10n/l10n.dart';

class DeviceMfaPanel extends StatefulWidget {
  const DeviceMfaPanel({this.service, this.onBusyChanged, super.key});
  final ValueChanged<bool>? onBusyChanged;
  final DeviceMfaService? service;
  @override
  State<DeviceMfaPanel> createState() => _DeviceMfaPanelState();
}

class _DeviceMfaPanelState extends State<DeviceMfaPanel>
    with WidgetsBindingObserver {
  late final DeviceMfaService _service = widget.service ?? DeviceMfaService();
  final _name = TextEditingController();
  Timer? _timer;
  bool _registered = false;
  bool _busy = true;
  Object? _error;
  Future<void> Function()? _retry;
  String? _code;
  late DateTime _codeExpires;
  DeviceMfaRegistry? _registry;
  String? _currentFactorId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_run(_refresh, blockDismissal: false));
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _code == null) return;
      setState(() {
        if (!_codeExpires.isAfter(DateTime.now())) _code = null;
      });
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed && mounted) {
      setState(() => _code = null);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _name.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    _retry = _refresh;
    final status = await _service.status();
    if (!mounted) return;
    _registry = status.registry;
    _currentFactorId = status.currentFactorId;
    _registered = status.registry.devices.any(
      (device) => device.factorId == status.currentFactorId && device.verified,
    );
  }

  Future<void> _run(
    Future<void> Function() action, {
    bool blockDismissal = true,
  }) async {
    _retry = action;
    widget.onBusyChanged?.call(blockDismissal);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _error = error;
        });
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        widget.onBusyChanged?.call(false);
      }
    }
  }

  void _enroll(String reason) {
    final l10n = context.l10n;
    unawaited(
      _run(() async {
        await _service.enroll(
          name: _name.text.trim().isEmpty
              ? l10n.deviceMfaDefaultName
              : _name.text.trim(),
          reason: reason,
        );
        await _refresh();
        unawaited(
          PushNotificationService.instance
              .ensurePermissionPrompted()
              .catchError((Object _) {}),
        );
      }),
    );
  }

  void _toggleCode(String reason) {
    if (_code != null) {
      setState(() => _code = null);
      return;
    }
    unawaited(
      _run(() async {
        final code = await _service.code(reason: reason);
        if (!mounted) return;
        _code = code;
        final now = DateTime.now().millisecondsSinceEpoch;
        _codeExpires = DateTime.fromMillisecondsSinceEpoch(
          (now ~/ 30000 + 1) * 30000,
        );
      }),
    );
  }

  Future<void> _confirmRemove(String reason) async {
    final l10n = context.l10n;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.deviceMfaRemoveConfirmTitle,
      message: l10n.deviceMfaRemoveHint,
      confirmLabel: l10n.deviceMfaRemove,
      cancelLabel: l10n.commonCancel,
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    unawaited(
      _run(() async {
        await _service.remove(reason: reason);
        await _refresh();
        _code = null;
      }),
    );
  }

  String? _statusSubtitle(AppLocalizations l10n) {
    final registry = _registry;
    if (!_registered || registry == null) return l10n.deviceMfaDescription;
    final current = registry.devices
        .where((device) => device.factorId == _currentFactorId)
        .firstOrNull;
    final trusted = l10n.deviceMfaTrustedSummary(
      registry.devices.where((device) => device.verified).length,
    );
    return current == null ? trusted : '${current.name} · $trusted';
  }

  List<Widget> _statusActions(AppLocalizations l10n, String reason) {
    final tokens = AppTokens.of(context);
    final registry = _registry;
    if (!_registered && registry?.locked == true) {
      return [
        AppAlert(
          variant: AppAlertVariant.warning,
          content: Text(l10n.deviceMfaLocked),
        ),
      ];
    }
    if (!_registered && registry != null) {
      return [
        Text(
          l10n.deviceMfaEnrollWarning,
          style: tokens.typography.small.copyWith(
            color: tokens.colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          selectionControls: platformTextSelectionControls(),
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: _name,
          enabled: !_busy,
          placeholder: l10n.deviceMfaName,
          maxLength: 40,
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton.primary(
          onPressed: _busy ? null : () => _enroll(reason),
          child: Text(l10n.deviceMfaEnroll),
        ),
      ];
    }
    if (!_registered) return const [];
    final code = _code;
    return [
      if (code != null) ...[
        DeviceMfaCodeDisplay(
          code: code,
          secondsLeft:
              (_codeExpires.difference(DateTime.now()).inMilliseconds / 1000)
                  .ceil(),
        ),
        const SizedBox(height: AppSpacing.md),
      ],
      AppButton.primary(
        leading: Icon(
          code == null ? LucideIcons.eye : LucideIcons.eyeOff,
          size: 18,
        ),
        onPressed: _busy ? null : () => _toggleCode(reason),
        child: Text(
          code == null ? l10n.deviceMfaShowCode : l10n.deviceMfaHideCode,
        ),
      ),
      const SizedBox(height: AppSpacing.xs),
      _DestructiveTextButton(
        label: l10n.deviceMfaRemove,
        onPressed: _busy ? null : () => unawaited(_confirmRemove(reason)),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final reason = l10n.deviceMfaVerifyReason;
    final tokens = AppTokens.of(context);
    final registry = _registry;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_busy) ...[
            Row(
              children: [
                const AppLoadingIndicator.inline(),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    l10n.deviceMfaWorking,
                    style: tokens.typography.small.copyWith(
                      color: tokens.colorScheme.mutedForeground,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
          if (_error != null) ...[
            AppAlert.destructive(
              title: Text(l10n.deviceMfaActionFailed),
              content: Text(deviceMfaErrorMessage(_error!, l10n)),
            ),
            const SizedBox(height: AppSpacing.sm),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: AppButton.outline(
                onPressed: _busy
                    ? null
                    : () => unawaited(
                        _run(
                          _retry ?? _refresh,
                          blockDismissal: _retry != _refresh,
                        ),
                      ),
                child: Text(l10n.commonRetry),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
          if (registry == null) ...[
            if (_busy && _error == null)
              const AppGroupedCard(children: [AppSkeletonRows()]),
          ] else
            DeviceMfaStatusCard(
              registered: _registered,
              title: _registered
                  ? l10n.deviceMfaReady
                  : l10n.deviceMfaNotRegisteredTitle,
              subtitle: _statusSubtitle(l10n),
              children: _statusActions(l10n, reason),
            ),
          if (registry != null &&
              (_registered || registry.devices.isNotEmpty)) ...[
            const SizedBox(height: AppLayout.sectionGap),
            TrustedAuthenticatorsPanel(
              registry: registry,
              currentFactorId: _currentFactorId,
              canManage: _registered && !_busy,
              onLockChanged: (locked) => unawaited(
                _run(() async {
                  await _service.setRegistrationLock(
                    locked: locked,
                    reason: reason,
                  );
                  await _refresh();
                }),
              ),
              onRemove: (factorId) => unawaited(
                _run(() async {
                  await _service.removeTrustedDevice(factorId, reason: reason);
                  _code = null;
                  await _refresh();
                }),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Quiet destructive action: destructive text without a filled surface, so
/// it never competes with the primary action above it.
class _DestructiveTextButton extends StatelessWidget {
  const _DestructiveTextButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final color = onPressed == null ? c.mutedForeground : c.destructive;
    return TextButton.icon(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: color,
        minimumSize: const Size.fromHeight(44),
        shape: const StadiumBorder(),
      ),
      icon: Icon(LucideIcons.trash2, size: 16, color: color),
      label: Text(label),
    );
  }
}
