import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_tile.dart';

/// Settings sub-pages build forms from these rows inside
/// `SettingsCompactSection` cards, so toggles, pickers and text fields share
/// one icon column, inset and divider rhythm.

/// On/off row; the whole row toggles, not only the switch.
class SettingsSwitchRow extends StatelessWidget {
  const SettingsSwitchRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) => MergeSemantics(
    child: SettingsTile(
      grouped: true,
      icon: icon,
      title: title,
      subtitle: subtitle,
      wrapSupportingText: true,
      showChevron: false,
      trailingWidth: 64,
      onTap: onChanged == null ? null : () => onChanged!(!value),
      trailing: AppSwitch(value: value, onChanged: onChanged),
    ),
  );
}

/// Single choice shown as its current value; opens an option sheet.
class SettingsChoiceRow<T> extends StatelessWidget {
  const SettingsChoiceRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.options,
    required this.onChanged,
    this.subtitle,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final T value;
  final List<AppSelectOption<T>> options;
  final ValueChanged<T>? onChanged;

  @override
  Widget build(BuildContext context) {
    final current = options.where((o) => o.value == value).firstOrNull;
    return SettingsTile(
      grouped: true,
      icon: icon,
      title: title,
      subtitle: subtitle,
      trailingValue: current?.label,
      onTap: onChanged == null ? null : () => unawaited(_pick(context)),
    );
  }

  Future<void> _pick(BuildContext context) async {
    final picked = await showAppSelectSheet<T>(
      context: context,
      title: title,
      options: options,
      value: value,
    );
    if (picked != null) onChanged?.call(picked.value);
  }
}

/// Pads a text field (or other free-form control) to the row insets.
class SettingsFieldRow extends StatelessWidget {
  const SettingsFieldRow({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(
      SettingsRowLayout.inset,
      AppSpacing.md,
      SettingsRowLayout.inset,
      AppSpacing.md,
    ),
    child: child,
  );
}
