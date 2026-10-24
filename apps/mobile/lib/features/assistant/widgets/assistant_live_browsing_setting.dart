import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_settings_info.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantLiveBrowsingSetting extends StatelessWidget {
  const AssistantLiveBrowsingSetting({
    required this.keepLiveWhileBrowsing,
    required this.onKeepLiveWhileBrowsingChanged,
    this.enabled = true,
    super.key,
  });
  final bool keepLiveWhileBrowsing;
  final bool enabled;
  final Future<void> Function({required bool value}) onKeepLiveWhileBrowsingChanged;

  @override
  Widget build(BuildContext context) => AppToggleRow(
    value: keepLiveWhileBrowsing,
    title: Row(children: [
      Expanded(child: Text(context.l10n.assistantKeepLiveBrowsingTitle)),
      AssistantSettingsInfo(
        title: context.l10n.assistantKeepLiveBrowsingTitle,
        description: context.l10n.assistantKeepLiveBrowsingDescription,
      ),
    ]),
    onChanged: enabled ? (value) => onKeepLiveWhileBrowsingChanged(value: value) : null,
  );
}
