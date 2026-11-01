import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

class PushSettingsTile extends StatefulWidget {
  const PushSettingsTile({super.key});

  @override
  State<PushSettingsTile> createState() => _PushSettingsTileState();
}

class _PushSettingsTileState extends State<PushSettingsTile> {
  bool? _enabled;
  bool _busy = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final enabled = await PushNotificationService.instance.pushEnabled;
    if (mounted) setState(() => _enabled = enabled);
  }

  Future<void> _change(bool enabled) async {
    setState(() => _busy = true);
    try {
      await PushNotificationService.instance.setPushEnabled(enabled: enabled);
      if (mounted) {
        setState(() {
          _enabled = enabled;
          _failed = false;
        });
      }
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SettingsTile(
      grouped: true,
      icon: LucideIcons.bellRing,
      title: l10n.settingsPushNotifications,
      subtitle: _failed
          ? l10n.settingsTelemetryError
          : l10n.settingsPushFirebaseDisclosure,
      showChevron: false,
      trailing: AppSwitch(
        value: _enabled ?? false,
        semanticLabel: l10n.settingsPushNotifications,
        onChanged: _enabled == null || _busy ? null : _change,
      ),
    );
  }
}
