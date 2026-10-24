part of 'threshold_settings_dialog.dart';

/// One grouped-card row: a label and its trailing control.
class _ThresholdRow extends StatelessWidget {
  const _ThresholdRow({
    required this.title,
    required this.trailing,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: SettingsRowLayout.minHeight),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: SettingsRowLayout.inset,
          vertical: 8,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: theme.typography.base.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (subtitle case final hint?) ...[
                    const AppGap(2),
                    Text(
                      hint,
                      style: theme.typography.small.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const AppGap(12),
            trailing,
          ],
        ),
      ),
    );
  }
}

/// A compact right-aligned number entry with its unit, as in iOS Settings.
class _NumberField extends StatelessWidget {
  const _NumberField({
    required this.controller,
    required this.unit,
    required this.placeholder,
    required this.enabled,
  });

  final TextEditingController controller;
  final String unit;
  final String placeholder;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 64,
          child: shad.TextField(
            selectionControls: platformTextSelectionControls(),
            contextMenuBuilder: platformTextContextMenuBuilder(),
            controller: controller,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.end,
            placeholder: Text(placeholder),
            enabled: enabled,
          ),
        ),
        const AppGap(8),
        Text(
          unit,
          style: theme.typography.base.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}
