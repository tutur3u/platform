import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/iris/data/iris_device_identity.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/view/iris_enrol_panel.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/iris/devices`: the devices trusted to use Iris (at most 3),
/// each revocable, and enrolment of this device.
///
/// Revoking asks for a second tap on the same button rather than a native
/// dialog. Recovery is revoke, then enrol again with a fresh code.
class IrisDevicesPage extends StatefulWidget {
  const IrisDevicesPage({required this.relay, this.identity, super.key});

  final IrisRelay relay;

  /// Null on builds without a device key (until the native key lands).
  final IrisDeviceIdentity? identity;

  @override
  State<IrisDevicesPage> createState() => _IrisDevicesPageState();
}

class _IrisDevicesPageState extends State<IrisDevicesPage> {
  IrisResult<List<IrisDevice>>? _devices;
  String? _armedRevoke;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final result = await widget.relay.devices();
    if (mounted) setState(() => _devices = result);
  }

  Future<void> _revoke(String id) async {
    if (_armedRevoke != id) {
      setState(() => _armedRevoke = id);
      return;
    }
    setState(() => _armedRevoke = null);
    await widget.relay.revoke(id);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final devices = _devices;
    return Column(
      children: [
        ShellTitleOverride(
          ownerId: 'mastermind-iris-devices',
          locations: const {Routes.mastermindIrisDevices},
          title: l10n.mastermindIrisDevicesTitle,
          showLeadingBrand: false,
        ),
        Expanded(
          child: AppPageScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverList.list(
                children: [
                  switch (devices) {
                    null => const Padding(
                      padding: EdgeInsets.all(AppSpacing.lg),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                    IrisErr() => AppAlert(
                      leading: const Icon(AppIcons.info),
                      content: Text(l10n.mastermindIrisDevicesLoadFailed),
                    ),
                    IrisOk(:final value) => AppGroupedSection.spaced(
                      caption: l10n.mastermindIrisDevicesTitle,
                      children: [
                        if (value.isEmpty)
                          AppGroupedRow(
                            title: Text(l10n.mastermindIrisDevicesEmpty),
                          ),
                        for (final device in value) _row(context, device),
                      ],
                    ),
                  },
                  IrisEnrolPanel(
                    relay: widget.relay,
                    identity: widget.identity,
                    onFinished: () => unawaited(_load()),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _row(BuildContext context, IrisDevice device) {
    final l10n = context.l10n;
    final active =
        device.status == IrisDeviceStatus.confirmed ||
        device.status == IrisDeviceStatus.pending;
    return AppGroupedRow(
      key: ValueKey('iris-device-${device.id}'),
      leading: const AppIconTile(icon: LucideIcons.smartphone),
      title: Text(device.label),
      subtitle: Wrap(
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        children: [
          MastermindStatusChip(label: irisDeviceStatusText(l10n, device)),
          if (device.qa)
            MastermindStatusChip(label: l10n.mastermindIrisDeviceQa),
          Text(l10n.mastermindIrisDeviceFingerprint(device.fingerprintPrefix)),
        ],
      ),
      trailing: active
          ? AppButton.destructive(
              key: ValueKey('iris-revoke-${device.id}'),
              size: AppButtonSize.small,
              onPressed: () => unawaited(_revoke(device.id)),
              child: Text(
                _armedRevoke == device.id
                    ? l10n.mastermindIrisRevokeConfirm
                    : l10n.mastermindIrisRevoke,
              ),
            )
          : null,
    );
  }
}

String irisDeviceStatusText(AppLocalizations l10n, IrisDevice device) =>
    switch (device.status) {
      IrisDeviceStatus.pending => l10n.mastermindIrisDeviceStatusPending,
      IrisDeviceStatus.confirmed => l10n.mastermindIrisDeviceStatusConfirmed,
      IrisDeviceStatus.expired => l10n.mastermindIrisDeviceStatusExpired,
      IrisDeviceStatus.revoked => l10n.mastermindIrisDeviceStatusRevoked,
    };
