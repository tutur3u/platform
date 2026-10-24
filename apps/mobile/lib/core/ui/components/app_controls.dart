import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Hairline separator. Replaces `shad.Divider` / `shad.VerticalDivider`.
class AppDivider extends StatelessWidget {
  const AppDivider({
    this.height = 1,
    this.thickness = 1,
    this.indent = 0,
    this.endIndent = 0,
    this.color,
    super.key,
  }) : vertical = false;

  const AppDivider.vertical({
    this.thickness = 1,
    this.indent = 0,
    this.endIndent = 0,
    this.color,
    double width = 1,
    super.key,
  }) : height = width,
       vertical = true;

  /// Extent across the line (height for horizontal, width for vertical).
  final double height;
  final double thickness;
  final double indent;
  final double endIndent;
  final Color? color;
  final bool vertical;

  @override
  Widget build(BuildContext context) {
    final resolved = color ?? AppTokens.of(context).colorScheme.border;
    return vertical
        ? VerticalDivider(
            width: height,
            thickness: thickness,
            indent: indent,
            endIndent: endIndent,
            color: resolved,
          )
        : Divider(
            height: height,
            thickness: thickness,
            indent: indent,
            endIndent: endIndent,
            color: resolved,
          );
  }
}

/// Token-styled on/off switch. Replaces `shad.Switch`.
class AppSwitch extends StatelessWidget {
  const AppSwitch({
    required this.value,
    required this.onChanged,
    this.semanticLabel,
    super.key,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return Semantics(
      label: semanticLabel,
      child: Switch.adaptive(
        value: value,
        onChanged: onChanged,
        activeTrackColor: c.primary,
        activeThumbColor: c.primaryForeground,
        inactiveTrackColor: c.input,
        inactiveThumbColor: c.background,
        trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    );
  }
}

/// Token-styled checkbox; `null` is the indeterminate state when [tristate].
/// Replaces `shad.Checkbox` (`CheckboxState.checked` -> `true`).
class AppCheckbox extends StatelessWidget {
  const AppCheckbox({
    required this.value,
    required this.onChanged,
    this.tristate = false,
    this.semanticLabel,
    super.key,
  });

  final bool? value;
  final ValueChanged<bool?>? onChanged;
  final bool tristate;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Checkbox(
      value: value,
      tristate: tristate,
      onChanged: onChanged,
      semanticLabel: semanticLabel,
      activeColor: c.primary,
      checkColor: c.primaryForeground,
      side: BorderSide(color: c.mutedForeground, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: tokens.borderRadiusSm / 2),
    );
  }
}

/// Token-styled tooltip. Replaces `shad.Tooltip`.
class AppTooltip extends StatelessWidget {
  const AppTooltip({required this.message, required this.child, super.key});

  final String message;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Tooltip(
      message: message,
      decoration: BoxDecoration(
        color: c.popoverForeground,
        borderRadius: tokens.borderRadiusSm,
      ),
      textStyle: tokens.typography.xSmall.copyWith(color: c.popover),
      child: child,
    );
  }
}
