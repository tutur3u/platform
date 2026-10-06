import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantSettingsSheetBody extends StatelessWidget {
  const AssistantSettingsSheetBody({
    required this.keepLiveWhileBrowsing,
    required this.onKeepLiveWhileBrowsingChanged,
    this.enabled = true,
    this.showTitle = true,
    super.key,
  });

  final bool keepLiveWhileBrowsing;
  final bool enabled;
  final bool showTitle;
  final Future<void> Function({required bool value})
  onKeepLiveWhileBrowsingChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      top: false,
      bottom: showTitle,
      child: Padding(
        padding: showTitle
            ? const EdgeInsets.fromLTRB(20, 20, 20, 24)
            : const EdgeInsets.fromLTRB(20, 8, 20, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showTitle)
              Text(
                context.l10n.assistantSettingsTitle,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            if (showTitle) const SizedBox(height: 12),
            SwitchListTile.adaptive(
              value: keepLiveWhileBrowsing,
              title: Text(context.l10n.assistantKeepLiveBrowsingTitle),
              subtitle: Text(context.l10n.assistantKeepLiveBrowsingDescription),
              contentPadding: EdgeInsets.zero,
              onChanged: enabled
                  ? (value) => onKeepLiveWhileBrowsingChanged(value: value)
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}
