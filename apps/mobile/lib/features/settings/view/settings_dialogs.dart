import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SettingsChoiceOption<T> {
  const SettingsChoiceOption({
    required this.value,
    required this.label,
    required this.icon,
    this.description,
  });

  final T value;
  final String label;
  final IconData icon;
  final String? description;
}

Future<T?> showSettingsChoiceDialog<T>({
  required BuildContext context,
  required String title,
  required List<SettingsChoiceOption<T>> options,
  required T currentValue,
  String? description,
}) {
  return showAdaptiveSheet<T>(
    context: context,
    maxDialogWidth: 420,
    builder: (dialogContext) {
      return AppDialogScaffold(
        title: title,
        description: description,
        icon: Icons.tune_rounded,
        maxWidth: 420,
        maxHeightFactor: 0.72,
        actions: [
          shad.OutlineButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(dialogContext.l10n.commonCancel),
          ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final option in options)
              _SettingsChoiceTile<T>(
                option: option,
                isSelected: option.value == currentValue,
                onTap: () => Navigator.of(dialogContext).pop(option.value),
              ),
          ],
        ),
      );
    },
  );
}

Future<bool?> showSettingsConfirmationDialog({
  required BuildContext context,
  required String title,
  required String description,
  required String confirmLabel,
  IconData? icon,
  bool isDestructive = false,
}) {
  return showAdaptiveSheet<bool>(
    context: context,
    maxDialogWidth: 420,
    builder: (dialogContext) {
      return AppDialogScaffold(
        title: title,
        description: description,
        icon: icon,
        maxWidth: 420,
        maxHeightFactor: 0.42,
        actions: [
          shad.OutlineButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.l10n.commonCancel),
          ),
          if (isDestructive)
            shad.DestructiveButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(confirmLabel),
            )
          else
            shad.PrimaryButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(confirmLabel),
            ),
        ],
        child: const SizedBox.shrink(),
      );
    },
  );
}

class _SettingsChoiceTile<T> extends StatelessWidget {
  const _SettingsChoiceTile({
    required this.option,
    required this.isSelected,
    required this.onTap,
  });

  final SettingsChoiceOption<T> option;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              color: isSelected
                  ? theme.colorScheme.primary.withValues(alpha: 0.10)
                  : theme.colorScheme.card,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isSelected
                    ? theme.colorScheme.primary.withValues(alpha: 0.55)
                    : theme.colorScheme.border.withValues(alpha: 0.75),
              ),
            ),
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? theme.colorScheme.primary.withValues(alpha: 0.14)
                        : theme.colorScheme.background,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    option.icon,
                    size: 18,
                    color: isSelected
                        ? theme.colorScheme.primary
                        : theme.colorScheme.foreground,
                  ),
                ),
                const shad.Gap(12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        option.label,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (option.description?.trim().isNotEmpty ?? false) ...[
                        const shad.Gap(4),
                        Text(
                          option.description!,
                          style: theme.typography.textSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const shad.Gap(12),
                Icon(
                  isSelected
                      ? Icons.check_circle_rounded
                      : Icons.radio_button_unchecked_rounded,
                  size: 20,
                  color: isSelected
                      ? theme.colorScheme.primary
                      : theme.colorScheme.mutedForeground,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
