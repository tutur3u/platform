import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

class AppChip extends StatelessWidget {
  const AppChip({
    required this.label,
    this.selected,
    this.onSelected,
    this.onPressed,
    this.avatar,
    this.onDeleted,
    this.deleteTooltip,
    this.tooltip,
    super.key,
  });
  final Widget label;

  /// Null for display/action chips; a bool identifies a selectable choice.
  final bool? selected;
  final ValueChanged<bool>? onSelected;
  final VoidCallback? onPressed;
  final Widget? avatar;
  final VoidCallback? onDeleted;
  final String? deleteTooltip;
  final String? tooltip;
  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final isSelected = selected ?? false;
    final activate =
        onPressed ??
        (onSelected == null ? null : () => onSelected!(!isSelected));
    final content = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: isSelected ? c.primary : c.muted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: isSelected ? c.primary : c.border),
      ),
      child: DefaultTextStyle.merge(
        style: tokens.typography.small.copyWith(
          color: isSelected ? c.primaryForeground : c.foreground,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (avatar != null) ...[
              SizedBox.square(dimension: 18, child: avatar),
              const SizedBox(width: 6),
            ],
            Flexible(child: label),
          ],
        ),
      ),
    );
    final result = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Semantics(
            container: true,
            selected: selected,
            button: activate != null || selected != null,
            enabled: activate != null || selected != null
                ? activate != null
                : null,
            child: activate == null
                ? Opacity(opacity: selected == null ? 1 : 0.5, child: content)
                : AppControlTarget(onTap: activate, child: content),
          ),
        ),
        if (onDeleted != null)
          AppIconButton(
            tooltip:
                deleteTooltip ??
                MaterialLocalizations.of(context).deleteButtonTooltip,
            onPressed: onDeleted,
            icon: const Icon(LucideIcons.x, size: 16),
          ),
      ],
    );
    return tooltip == null ? result : Tooltip(message: tooltip, child: result);
  }
}
