import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_button_style.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Square icon-only button. [tooltip] doubles as the accessible label, so it
/// is required: every icon-only control needs a name.
class AppIconButton extends StatelessWidget {
  const AppIconButton({
    required this.icon,
    required this.onPressed,
    required this.tooltip,
    this.variant = AppButtonVariant.ghost,
    this.size = AppButtonSize.normal,
    this.density = AppButtonDensity.icon,
    this.shape = AppButtonShape.rounded,
    this.onLongPress,
    this.focusNode,
    super.key,
  });

  final Widget icon;
  final VoidCallback? onPressed;
  final String tooltip;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final AppButtonDensity density;
  final AppButtonShape shape;
  final VoidCallback? onLongPress;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final style = AppButtonStyle.resolve(
      AppTokens.of(context),
      variant,
      size,
      density == AppButtonDensity.iconDense
          ? AppButtonDensity.iconDense
          : AppButtonDensity.icon,
    );
    return Tooltip(
      message: tooltip,
      excludeFromSemantics: true,
      child: AppButtonFrame(
        style: style,
        shape: shape,
        onPressed: onPressed,
        onLongPress: onLongPress,
        focusNode: focusNode,
        semanticLabel: tooltip,
        child: IconTheme.merge(
          data: IconThemeData(
            color: style.foreground,
            size: style.iconSize + 4,
          ),
          child: icon,
        ),
      ),
    );
  }
}
