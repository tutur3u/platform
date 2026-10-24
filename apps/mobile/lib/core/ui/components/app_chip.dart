import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

class AppChip extends StatelessWidget {
  const AppChip({
    required this.label,
    this.selected = false,
    this.onSelected,
    this.onPressed,
    this.avatar,
    this.onDeleted,
    this.deleteTooltip,
    super.key,
  });
  final Widget label;
  final bool selected;
  final ValueChanged<bool>? onSelected;
  final VoidCallback? onPressed;
  final Widget? avatar;
  final VoidCallback? onDeleted;
  final String? deleteTooltip;
  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final activate =
        onPressed ?? (onSelected == null ? null : () => onSelected!(!selected));
    final content = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: selected ? c.primary : c.muted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: selected ? c.primary : c.border),
      ),
      child: DefaultTextStyle.merge(
        style: tokens.typography.small.copyWith(
          color: selected ? c.primaryForeground : c.foreground,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (avatar != null) ...[avatar!, const SizedBox(width: 6)],
            Flexible(child: label),
          ],
        ),
      ),
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Semantics(
            selected: onSelected == null ? null : selected,
            button: activate != null,
            child: activate == null
                ? content
                : AppControlTarget(onTap: activate, child: content),
          ),
        ),
        if (onDeleted != null)
          Semantics(
            label:
                deleteTooltip ??
                MaterialLocalizations.of(context).deleteButtonTooltip,
            button: true,
            child: AppControlTarget(
              onTap: onDeleted,
              child: const Padding(
                padding: EdgeInsets.all(8),
                child: Icon(LucideIcons.x, size: 16),
              ),
            ),
          ),
      ],
    );
  }
}
