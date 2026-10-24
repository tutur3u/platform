import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_button_style.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

export 'package:mobile/core/ui/components/app_button_style.dart';

/// Text button of the mobile design system.
///
/// The named constructors mirror the legacy shadcn buttons
/// (`shad.PrimaryButton` -> `AppButton.primary`) and keep their parameter
/// names: `child`, `onPressed`, `leading`, `trailing`, `density`, `size`,
/// `shape`, `enabled` and `alignment`.
class AppButton extends StatelessWidget {
  const AppButton({
    required this.child,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.leading,
    this.trailing,
    this.density = AppButtonDensity.normal,
    this.size = AppButtonSize.normal,
    this.shape = AppButtonShape.rounded,
    this.enabled,
    this.loading = false,
    this.alignment,
    this.onLongPress,
    this.focusNode,
    this.semanticLabel,
    super.key,
  });

  const AppButton.primary({
    required this.child,
    required this.onPressed,
    this.leading,
    this.trailing,
    this.density = AppButtonDensity.normal,
    this.size = AppButtonSize.normal,
    this.shape = AppButtonShape.rounded,
    this.enabled,
    this.loading = false,
    this.alignment,
    this.onLongPress,
    this.focusNode,
    this.semanticLabel,
    super.key,
  }) : variant = AppButtonVariant.primary;

  const AppButton.secondary({
    required this.child,
    required this.onPressed,
    this.leading,
    this.trailing,
    this.density = AppButtonDensity.normal,
    this.size = AppButtonSize.normal,
    this.shape = AppButtonShape.rounded,
    this.enabled,
    this.loading = false,
    this.alignment,
    this.onLongPress,
    this.focusNode,
    this.semanticLabel,
    super.key,
  }) : variant = AppButtonVariant.secondary;

  const AppButton.outline({
    required this.child,
    required this.onPressed,
    this.leading,
    this.trailing,
    this.density = AppButtonDensity.normal,
    this.size = AppButtonSize.normal,
    this.shape = AppButtonShape.rounded,
    this.enabled,
    this.loading = false,
    this.alignment,
    this.onLongPress,
    this.focusNode,
    this.semanticLabel,
    super.key,
  }) : variant = AppButtonVariant.outline;

  const AppButton.ghost({
    required this.child,
    required this.onPressed,
    this.leading,
    this.trailing,
    this.density = AppButtonDensity.normal,
    this.size = AppButtonSize.normal,
    this.shape = AppButtonShape.rounded,
    this.enabled,
    this.loading = false,
    this.alignment,
    this.onLongPress,
    this.focusNode,
    this.semanticLabel,
    super.key,
  }) : variant = AppButtonVariant.ghost;

  const AppButton.destructive({
    required this.child,
    required this.onPressed,
    this.leading,
    this.trailing,
    this.density = AppButtonDensity.normal,
    this.size = AppButtonSize.normal,
    this.shape = AppButtonShape.rounded,
    this.enabled,
    this.loading = false,
    this.alignment,
    this.onLongPress,
    this.focusNode,
    this.semanticLabel,
    super.key,
  }) : variant = AppButtonVariant.destructive;

  final Widget child;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final Widget? leading;
  final Widget? trailing;
  final AppButtonDensity density;
  final AppButtonSize size;
  final AppButtonShape shape;

  /// Overrides the enabled state derived from [onPressed].
  final bool? enabled;

  /// Replaces [leading] with a spinner and blocks presses.
  final bool loading;
  final AlignmentGeometry? alignment;
  final VoidCallback? onLongPress;
  final FocusNode? focusNode;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final active = (enabled ?? onPressed != null) && !loading;
    final style = AppButtonStyle.resolve(tokens, variant, size, density);
    final foreground = style.foreground;
    final spinner = SizedBox.square(
      dimension: style.iconSize,
      child: CircularProgressIndicator(strokeWidth: 2, color: foreground),
    );
    final content = Row(
      mainAxisSize: alignment == null ? MainAxisSize.min : MainAxisSize.max,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (loading) spinner else ?leading,
        if (loading || leading != null) SizedBox(width: style.gap),
        Flexible(child: child),
        if (trailing != null) ...[SizedBox(width: style.gap), trailing!],
      ],
    );
    return AppButtonFrame(
      style: style,
      shape: shape,
      onPressed: active ? onPressed : null,
      onLongPress: active ? onLongPress : null,
      focusNode: focusNode,
      semanticLabel: semanticLabel,
      busy: loading,
      child: DefaultTextStyle.merge(
        style: style.textStyle.copyWith(color: foreground),
        textAlign: TextAlign.center,
        child: IconTheme.merge(
          data: IconThemeData(color: foreground, size: style.iconSize),
          child: alignment == null
              ? content
              : Align(alignment: alignment!, child: content),
        ),
      ),
    );
  }
}
