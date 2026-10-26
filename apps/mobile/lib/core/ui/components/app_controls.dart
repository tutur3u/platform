import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

export 'app_checkbox.dart';
export 'app_switch.dart';

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
