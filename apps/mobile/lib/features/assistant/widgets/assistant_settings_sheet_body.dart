import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantSettingsSheetBody extends StatelessWidget {
  const AssistantSettingsSheetBody({
    required this.keepLiveWhileBrowsing,
    required this.onKeepLiveWhileBrowsingChanged,
    super.key,
  });

  final bool keepLiveWhileBrowsing;
  final Future<void> Function({required bool value})
  onKeepLiveWhileBrowsingChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.l10n.assistantSettingsTitle,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            SwitchListTile.adaptive(
              value: keepLiveWhileBrowsing,
              title: Text(context.l10n.assistantKeepLiveBrowsingTitle),
              subtitle: Text(context.l10n.assistantKeepLiveBrowsingDescription),
              contentPadding: EdgeInsets.zero,
              onChanged: (value) =>
                  onKeepLiveWhileBrowsingChanged(value: value),
            ),
          ],
        ),
      ),
    );
  }
}
