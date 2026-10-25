import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// One choice in an [AppFilterBar].
@immutable
class AppFilterOption<T> {
  const AppFilterOption({
    required this.value,
    required this.label,
    this.count,
    this.icon,
  });

  final T value;
  final String label;

  /// Optional item count shown inside the pill.
  final int? count;
  final IconData? icon;
}

/// Single-select row of filter pills with an optional trailing control,
/// usually an [AppFilterButton]. The pills scroll horizontally when they do
/// not fit; the trailing control stays pinned.
///
/// Search belongs to the shell search action (or `AppSearchField` outside
/// the shell), not to this bar.
class AppFilterBar<T> extends StatelessWidget {
  const AppFilterBar({
    required this.options,
    required this.selected,
    required this.onSelected,
    this.trailing,
    super.key,
  });

  final List<AppFilterOption<T>> options;
  final T selected;
  final ValueChanged<T> onSelected;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final (index, option) in options.indexed) ...[
                if (index > 0) const SizedBox(width: AppSpacing.sm),
                _FilterPill(
                  option: option,
                  selected: option.value == selected,
                  onTap: () => onSelected(option.value),
                ),
              ],
            ],
          ),
        ),
      ),
      if (trailing case final trailing?) ...[
        const SizedBox(width: AppSpacing.sm),
        trailing,
      ],
    ],
  );
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final AppFilterOption<Object?> option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final foreground = selected ? c.primaryForeground : c.foreground;
    final count = option.count;
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: AppControlTarget(
        onTap: onTap,
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md + 2),
          decoration: BoxDecoration(
            color: selected ? c.primary : c.muted.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: selected ? c.primary : c.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (option.icon case final icon?) ...[
                Icon(icon, size: 16, color: foreground),
                const SizedBox(width: AppSpacing.xs + 2),
              ],
              Text(
                option.label,
                style: tokens.typography.small.copyWith(
                  color: foreground,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
              if (count != null) ...[
                const SizedBox(width: AppSpacing.xs + 2),
                Text(
                  '$count',
                  style: tokens.typography.xSmall.copyWith(
                    color: selected
                        ? c.primaryForeground.withValues(alpha: 0.85)
                        : c.mutedForeground,
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Trailing control of an [AppFilterBar] that names the active sort order
/// or scope and opens the caller's picker sheet, for example "Newest" or a
/// collection name.
class AppFilterButton extends StatelessWidget {
  const AppFilterButton({
    required this.label,
    required this.onPressed,
    this.icon = LucideIcons.arrowUpDown,
    this.tooltip,
    this.active = false,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData icon;
  final String? tooltip;

  /// Highlights the button while it narrows the list (not the default).
  final bool active;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final button = Semantics(
      button: true,
      label: tooltip,
      child: AppControlTarget(
        onTap: onPressed,
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          constraints: const BoxConstraints(maxWidth: 200),
          decoration: BoxDecoration(
            color: active ? c.accent : null,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: active ? c.primary : c.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: c.foreground),
              const SizedBox(width: AppSpacing.xs + 2),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.typography.small.copyWith(
                    color: c.foreground,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip, child: button);
  }
}
