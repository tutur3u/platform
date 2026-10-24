import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

enum AppButtonVariant { primary, secondary, outline, ghost, destructive, link }

/// Horizontal padding policy. `icon*` densities make a square button.
enum AppButtonDensity { normal, comfortable, dense, compact, icon, iconDense }

/// Height steps: 32, 40 and 48 logical pixels.
enum AppButtonSize { small, normal, large }

enum AppButtonShape { rounded, circle }

/// Resolved colours and metrics for a button variant.
@immutable
class AppButtonStyle {
  const AppButtonStyle({
    required this.background,
    required this.foreground,
    required this.border,
    required this.overlay,
    required this.height,
    required this.horizontalPadding,
    required this.iconSize,
    required this.gap,
    required this.radius,
    required this.textStyle,
    required this.square,
  });

  factory AppButtonStyle.resolve(
    AppTokens tokens,
    AppButtonVariant variant,
    AppButtonSize size,
    AppButtonDensity density,
  ) {
    final c = tokens.colorScheme;
    final (background, foreground, border) = switch (variant) {
      AppButtonVariant.primary => (c.primary, c.primaryForeground, null),
      AppButtonVariant.secondary => (c.secondary, c.secondaryForeground, null),
      AppButtonVariant.outline => (null, c.foreground, c.border),
      AppButtonVariant.ghost => (null, c.foreground, null),
      AppButtonVariant.destructive => (
        c.destructive,
        c.destructiveForeground,
        null,
      ),
      AppButtonVariant.link => (null, c.primary, null),
    };
    final height = switch (size) {
      AppButtonSize.small => 32.0,
      AppButtonSize.normal => 40.0,
      AppButtonSize.large => 48.0,
    };
    final base = switch (size) {
      AppButtonSize.small => 12.0,
      AppButtonSize.normal => 16.0,
      AppButtonSize.large => 20.0,
    };
    final square =
        density == AppButtonDensity.icon ||
        density == AppButtonDensity.iconDense;
    return AppButtonStyle(
      background: background,
      foreground: foreground,
      border: border,
      overlay: foreground.withValues(alpha: 0.08),
      height: density == AppButtonDensity.iconDense ? height - 8 : height,
      horizontalPadding: switch (density) {
        AppButtonDensity.normal => base,
        AppButtonDensity.comfortable => base * 1.25,
        AppButtonDensity.dense => base / 2,
        AppButtonDensity.compact ||
        AppButtonDensity.icon ||
        AppButtonDensity.iconDense => 0,
      },
      iconSize: size == AppButtonSize.large ? 18 : 16,
      gap: size == AppButtonSize.small ? 6 : 8,
      radius: tokens.radiusMd,
      textStyle: size == AppButtonSize.small
          ? tokens.typography.xSmall.merge(tokens.typography.medium)
          : tokens.typography.textSmall,
      square: square,
    );
  }

  final Color? background;
  final Color foreground;
  final Color? border;
  final Color overlay;
  final double height;
  final double horizontalPadding;
  final double iconSize;
  final double gap;
  final double radius;
  final TextStyle textStyle;
  final bool square;
}

/// Shared surface, ink and semantics for `AppButton` and `AppIconButton`.
class AppButtonFrame extends StatelessWidget {
  const AppButtonFrame({
    required this.style,
    required this.child,
    required this.onPressed,
    this.shape = AppButtonShape.rounded,
    this.onLongPress,
    this.focusNode,
    this.semanticLabel,
    this.busy = false,
    super.key,
  });

  final AppButtonStyle style;
  final Widget child;
  final VoidCallback? onPressed;
  final VoidCallback? onLongPress;
  final AppButtonShape shape;
  final FocusNode? focusNode;
  final String? semanticLabel;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final border = style.border;
    final ShapeBorder outline = shape == AppButtonShape.circle
        ? CircleBorder(
            side: border == null ? BorderSide.none : BorderSide(color: border),
          )
        : RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(style.radius),
            side: border == null ? BorderSide.none : BorderSide(color: border),
          );
    final constraints = style.square || shape == AppButtonShape.circle
        ? BoxConstraints.tightFor(width: style.height, height: style.height)
        : BoxConstraints(minHeight: style.height, minWidth: style.height);
    return Semantics(
      button: true,
      enabled: enabled,
      label: semanticLabel,
      child: AnimatedOpacity(
        opacity: enabled || busy ? 1 : 0.5,
        duration: AppMotion.fast,
        child: Material(
          color: style.background ?? Colors.transparent,
          shape: outline,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            onLongPress: onLongPress,
            focusNode: focusNode,
            customBorder: outline,
            overlayColor: WidgetStatePropertyAll(style.overlay),
            child: ConstrainedBox(
              constraints: constraints,
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: style.horizontalPadding,
                ),
                child: Center(widthFactor: 1, heightFactor: 1, child: child),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
