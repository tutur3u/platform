import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_scoped_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

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
  return showScopedSettingsSheet<T>(
    context: context,
    sheetSize: AppSheetSize.fit,
    builder: (dialogContext) {
      return AppSheetScaffold(
        title: title,
        icon: LucideIcons.slidersHorizontal,
        actions: [
          AppButton.outline(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(dialogContext.l10n.commonCancel),
          ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (description?.trim().isNotEmpty ?? false) ...[
              Text(
                description!.trim(),
                style: AppTokens.of(dialogContext).typography.textSmall
                    .copyWith(
                      color: AppTokens.of(
                        dialogContext,
                      ).colorScheme.mutedForeground,
                    ),
              ),
              const AppGap(12),
            ],
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

/// Give the bundled license route its own Back dispatcher above the shell.
Future<void> showSettingsLicensePage({
  required BuildContext context,
  String applicationName = 'Tuturuuu',
  String? applicationVersion,
}) => Navigator.of(context, rootNavigator: true).push<void>(
  MaterialPageRoute(
    builder: (licenseContext) => BackButtonListener(
      onBackButtonPressed: () async {
        await Navigator.maybePop(licenseContext);
        return true;
      },
      child: LicensePage(
        applicationName: applicationName,
        applicationVersion: applicationVersion,
      ),
    ),
  ),
);

Future<bool?> showSettingsConfirmationDialog({
  required BuildContext context,
  required String title,
  required String description,
  required String confirmLabel,
  IconData? icon,
  bool isDestructive = false,
}) {
  return showScopedSettingsSheet<bool>(
    context: context,
    sheetSize: AppSheetSize.fit,
    builder: (dialogContext) {
      return AppSheetScaffold(
        title: title,
        description: description,
        icon: icon,
        actions: [
          AppButton.outline(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.l10n.commonCancel),
          ),
          if (isDestructive)
            AppButton.destructive(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(confirmLabel),
            )
          else
            AppButton.primary(
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
  Widget build(BuildContext context) => AppOptionTile(
    title: option.label,
    subtitle: option.description,
    selected: isSelected,
    leading: Icon(option.icon),
    onTap: onTap,
  );
}
