import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';

/// Rows in one rounded card. Over an ambient appearance the card is
/// translucent; dividers start at the title column, as on iOS settings.
class SettingsGroup extends StatelessWidget {
  const SettingsGroup({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    final radius = BorderRadius.circular(SettingsRowLayout.cardRadius);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: SettingsRowLayout.groupFill(context),
        borderRadius: radius,
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.5),
          width: 0.5,
        ),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var index = 0; index < children.length; index++) ...[
              if (index > 0)
                AppDivider(
                  thickness: 0.5,
                  indent: SettingsRowLayout.textColumn,
                  endIndent: SettingsRowLayout.inset,
                  color: theme.colorScheme.border,
                ),
              children[index],
            ],
          ],
        ),
      ),
    );
  }
}

/// Muted caption above a grouped card.
class SettingsCaption extends StatelessWidget {
  const SettingsCaption(this.text, {this.textAlign, super.key});

  final String text;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: SettingsRowLayout.captionInset,
      ),
      child: Text(
        text,
        textAlign: textAlign,
        style: theme.typography.small.copyWith(
          fontWeight: FontWeight.w500,
          color: theme.colorScheme.mutedForeground,
        ),
      ),
    );
  }
}

/// Root navigation groups: a caption above one rounded card.
class SettingsCompactSection extends StatelessWidget {
  const SettingsCompactSection({
    required this.title,
    required this.children,
    this.columnSplit,
    super.key,
  });

  final String title;
  final List<Widget> children;

  /// Expanded layouts retain the same compact groups in two columns.
  final int? columnSplit;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SettingsCaption(title),
      const AppGap(8),
      if (columnSplit case final split?)
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: SettingsGroup(children: children.take(split).toList()),
            ),
            const AppGap(16),
            Expanded(
              child: SettingsGroup(children: children.skip(split).toList()),
            ),
          ],
        )
      else
        SettingsGroup(children: children),
    ],
  );
}
