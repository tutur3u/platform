import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_error.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_repository.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mobile/features/security/device_mfa/trusted_authenticators_panel.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
  bool _confirmRemoval = false;
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final reason = l10n.deviceMfaVerifyReason;
    final theme = shad.Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_busy) ...[
            Row(
              children: [
                const NovaLoadingIndicator(size: 18),
                const shad.Gap(12),
                Expanded(child: Text(l10n.deviceMfaWorking)),
              ],
            ),
            const shad.Gap(16),
          ],
          if (_error != null) ...[
            Semantics(
              liveRegion: true,
              child: shad.Alert(
                title: Text(l10n.deviceMfaActionFailed),
                content: Text(deviceMfaErrorMessage(_error!, l10n)),
              ),
            ),
            const shad.Gap(8),
            shad.OutlineButton(
              alignment: Alignment.center,
              onPressed: _busy
                  ? null
                  : () => unawaited(_run(_retry ?? _refresh)),
              child: Text(l10n.commonRetry),
            ),
            const shad.Gap(16),
          ],
          Text(_registered ? l10n.deviceMfaReady : l10n.deviceMfaDescription),
          const shad.Gap(12),
          if (!_registered && _registry?.locked == true)
            Text(l10n.deviceMfaLocked),
          if (!_registered && _registry != null && !_registry!.locked) ...[
            Text(l10n.deviceMfaEnrollWarning, style: theme.typography.small),
            const shad.Gap(12),
            shad.TextField(
              controller: _name,
              enabled: !_busy,
              placeholder: Text(l10n.deviceMfaName),
              maxLength: 40,
            ),
            const shad.Gap(12),
            shad.PrimaryButton(
              alignment: Alignment.center,
              onPressed: _busy
                  ? null
                  : () => unawaited(
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
                    ),
              child: Text(l10n.deviceMfaEnroll),
            ),
          ] else if (_registered) ...[
            if (_code != null) ...[
              SelectableText(
                _code!,
                style: theme.typography.h1.copyWith(letterSpacing: 8),
              ),
              Text(l10n.deviceMfaCodeHint),
              const shad.Gap(12),
            ],
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                shad.PrimaryButton(
                  alignment: Alignment.center,
                  onPressed: _busy
                      ? null
                      : () {
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
                              _codeExpires =
                                  DateTime.fromMillisecondsSinceEpoch(
                                    (now ~/ 30000 + 1) * 30000,
                                  );
                            }),
                          );
                        },
                  child: Text(
                    _code == null
                        ? l10n.deviceMfaShowCode
                        : l10n.deviceMfaHideCode,
                  ),
                ),
                shad.OutlineButton(
                  alignment: Alignment.center,
                  onPressed: _busy
                      ? null
                      : () =>
                            setState(() => _confirmRemoval = !_confirmRemoval),
                  child: Text(l10n.deviceMfaRemove),
                ),
              ],
            ),
            if (_confirmRemoval) ...[
              const shad.Gap(12),
              Text(l10n.deviceMfaRemoveHint),
              const shad.Gap(8),
              shad.DestructiveButton(
                alignment: Alignment.center,
                onPressed: _busy
                    ? null
                    : () => unawaited(
                        _run(() async {
                          await _service.remove(reason: reason);
                          await _refresh();
                          _code = null;
                          _confirmRemoval = false;
                        }),
                      ),
                child: Text(l10n.deviceMfaRemove),
              ),
            ],
          ],
          if (_registry != null &&
              (_registered || _registry!.devices.isNotEmpty)) ...[
            const shad.Gap(16),
            TrustedAuthenticatorsPanel(
              registry: _registry!,
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
