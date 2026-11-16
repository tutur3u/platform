import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';

/// A 44dp round icon button of the shell top bar: a 22dp glyph in
/// `foreground` with a hover wash. [highlighted] marks it selected
/// (`roles.navSelectedFill` and `roles.navSelectedInk`);
/// [filled] makes it the ink circle of a primary create action.
class ShellTopBarButton extends StatelessWidget {
  const ShellTopBarButton({
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.highlighted = false,
    this.filled = false,
    this.badge,
    super.key,
  });

  /// A 22dp glyph; plain [Icon]s take the button's colour and size.
  final Widget icon;
  final VoidCallback? onPressed;
  final String? tooltip;
  final bool highlighted;
  final bool filled;

  /// Painted over the glyph's top end, e.g. the bell's unread dot.
  final Widget? badge;

  static const double size = AppInterfaceTokens.minTouchTarget;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final foreground = filled
        ? style.primaryForeground
        : highlighted
        ? style.navSelectedInk
        : style.foreground;
    final fill = filled
        ? style.primary
        : highlighted
        ? style.navSelectedFill
        : style.navSelectedFill.withValues(alpha: 0);
    final button = SizedBox.square(
      dimension: size,
      child: Material(
        type: MaterialType.circle,
        color: fill,
        clipBehavior: Clip.antiAlias,
        child: InkResponse(
          onTap: onPressed,
          containedInkWell: true,
          hoverColor: style.foreground.withValues(alpha: 0.06),
          highlightColor: style.foreground.withValues(alpha: 0.08),
          splashFactory: NoSplash.splashFactory,
          child: Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              IconTheme.merge(
                data: IconThemeData(
                  size: 22,
                  color: onPressed == null
                      ? foreground.withValues(alpha: 0.4)
                      : foreground,
                ),
                child: icon,
              ),
              if (badge case final badge?)
                PositionedDirectional(top: 10, end: 10, child: badge),
            ],
          ),
        ),
      ),
    );
    final label = tooltip;
    if (label == null || label.trim().isEmpty) return button;
    return Tooltip(message: label, child: button);
  }
}

/// The bell's 8dp unread dot, ringed with the page background.
class ShellUnreadDot extends StatelessWidget {
  const ShellUnreadDot({super.key});

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    return Container(
      key: const ValueKey('notifications-unread-badge'),
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: style.alert,
        shape: BoxShape.circle,
        border: Border.all(color: style.page, width: 2),
      ),
    );
  }
}
