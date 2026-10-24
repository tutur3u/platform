import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';

/// A captioned card with an iOS-style footer saying where its values live:
/// this device, the account or the whole workspace.
class AppSettingsGroup extends StatelessWidget {
  const AppSettingsGroup({
    required this.title,
    required this.children,
    this.footer,
    super.key,
  });

  final String title;
  final String? footer;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    final note = footer;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SettingsCompactSection(title: title, children: children),
        if (note != null && note.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              SettingsRowLayout.captionInset + 12,
              8,
              SettingsRowLayout.captionInset + 12,
              0,
            ),
            child: Text(
              note,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ),
      ],
    );
  }
}
