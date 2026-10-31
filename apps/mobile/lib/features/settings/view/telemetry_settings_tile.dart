import 'package:flutter/material.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

class TelemetrySettingsTile extends StatefulWidget {
  const TelemetrySettingsTile({super.key, this.preference});
  final TelemetryPreference? preference;

  @override
  State<TelemetrySettingsTile> createState() => _TelemetrySettingsTileState();
}

class _TelemetrySettingsTileState extends State<TelemetrySettingsTile> {
  bool _failed = false;

  Future<void> _change(TelemetryPreference preference, bool value) async {
    try {
      await preference.setEnabled(value: value);
      if (mounted) setState(() => _failed = false);
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final preference = widget.preference ?? TelemetryPreference.instance;
    final l10n = context.l10n;
    return ListenableBuilder(
      listenable: preference,
      builder: (context, _) => SettingsTile(
        grouped: true,
        icon: LucideIcons.shield,
        title: l10n.settingsShareTelemetry,
        subtitle: _failed
            ? l10n.settingsTelemetryError
            : '${l10n.settingsShareTelemetryDescription}\n\n'
                  '${l10n.telemetryFirebaseInstallationDisclosure}',
        showChevron: false,
        onTap: preference.ready && !preference.busy
            ? () => _change(preference, !preference.enabled)
            : null,
        trailing: AppSwitch(
          value: preference.enabled,
          semanticLabel: l10n.settingsShareTelemetry,
          onChanged: preference.ready && !preference.busy
              ? (value) => _change(preference, value)
              : null,
        ),
      ),
    );
  }
}
