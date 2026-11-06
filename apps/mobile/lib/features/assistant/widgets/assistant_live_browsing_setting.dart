import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Live section of Assistant settings: one grouped toggle whose
/// supporting line says what it does, instead of an info dialog.
class AssistantLiveBrowsingSetting extends StatelessWidget {
  const AssistantLiveBrowsingSetting({
    required this.keepLiveWhileBrowsing,
    required this.onKeepLiveWhileBrowsingChanged,
    this.enabled = true,
    super.key,
  });
  final bool keepLiveWhileBrowsing;
  final bool enabled;
  final Future<void> Function({required bool value})
  onKeepLiveWhileBrowsingChanged;

  @override
  Widget build(BuildContext context) => AppGroupedSection.spaced(
    caption: context.l10n.commonLive,
    dividerInset: AppLayout.rowHorizontalPadding,
    children: [
      AppToggleRow(
        padding: const EdgeInsets.symmetric(
          horizontal: AppLayout.rowHorizontalPadding,
          vertical: AppSpacing.sm,
        ),
        value: keepLiveWhileBrowsing,
        title: Text(context.l10n.assistantKeepLiveBrowsingTitle),
        subtitle: Text(context.l10n.assistantKeepLiveBrowsingDescription),
        onChanged: enabled
            ? (value) => onKeepLiveWhileBrowsingChanged(value: value)
            : null,
      ),
    ],
  );
}
