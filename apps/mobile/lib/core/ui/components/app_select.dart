import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_option_tile.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// One choice of an [AppSelect].
@immutable
class AppSelectOption<T> {
  const AppSelectOption({
    required this.value,
    required this.label,
    this.description,
    this.icon,
  });

  final T value;
  final String label;
  final String? description;
  final IconData? icon;
}

/// Field-like trigger that opens a picker sheet. Replaces `shad.Select` and
/// dropdown menus used for single choice.
class AppSelect<T> extends StatelessWidget {
  const AppSelect({
    required this.options,
    required this.value,
    required this.onChanged,
    required this.title,
    this.placeholder,
    super.key,
  });

  final List<AppSelectOption<T>> options;
  final T? value;
  final ValueChanged<T>? onChanged;

  /// Sheet title and accessible name of the trigger.
  final String title;
  final String? placeholder;

  Future<void> _open(BuildContext context) async {
    final picked = await showAppSheet<AppSelectOption<T>>(
      context: context,
      builder: (sheetContext) => AppSheetScaffold(
        title: title,
        slivers: [
          SliverList.builder(
            itemCount: options.length,
            itemBuilder: (_, index) {
              final option = options[index];
              return AppOptionTile(
                title: option.label,
                subtitle: option.description,
                leading: option.icon == null ? null : Icon(option.icon),
                selected: option.value == value,
                onTap: () => Navigator.of(sheetContext).pop(option),
              );
            },
          ),
        ],
      ),
    );
    if (picked != null) onChanged?.call(picked.value);
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final current = options.where((o) => o.value == value).firstOrNull;
    final enabled = onChanged != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: title,
      value: current?.label,
      excludeSemantics: true,
      child: Opacity(
        opacity: enabled ? 1 : 0.5,
        child: Material(
          color: c.card.withValues(alpha: 0),
          shape: RoundedRectangleBorder(
            borderRadius: tokens.borderRadiusLg,
            side: BorderSide(color: c.input),
          ),
          child: InkWell(
            onTap: enabled ? () => _open(context) : null,
            customBorder: RoundedRectangleBorder(
              borderRadius: tokens.borderRadiusLg,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md + 2,
                  vertical: AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        current?.label ?? placeholder ?? '',
                        style: tokens.typography.base.copyWith(
                          color: current == null
                              ? c.mutedForeground
                              : c.foreground,
                        ),
                      ),
                    ),
                    Icon(AppIcons.expand, size: 16, color: c.mutedForeground),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
