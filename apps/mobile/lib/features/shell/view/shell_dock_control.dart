import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Shared clip, ink and focus outline for the contents of a dock slot.
class ShellDockControl extends StatefulWidget {
  const ShellDockControl({
    required this.borderRadius,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.fill,
    super.key,
  });

  final BorderRadius borderRadius;
  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final Color? fill;

  @override
  State<ShellDockControl> createState() => _ShellDockControlState();
}

class _ShellDockControlState extends State<ShellDockControl> {
  bool _pressed = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ring = AppTokens.of(context).colorScheme.ring;
    final radius = widget.borderRadius;
    return Material(
      type: widget.fill == null
          ? MaterialType.transparency
          : MaterialType.canvas,
      color: widget.fill,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        borderRadius: radius,
        onTap: widget.onTap,
        onLongPress: widget.onLongPress,
        onHighlightChanged: (pressed) => setState(() => _pressed = pressed),
        onFocusChange: (focused) => setState(() => _focused = focused),
        hoverColor: theme.hoverColor,
        highlightColor: theme.highlightColor,
        focusColor: Colors.transparent,
        child: DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(
            borderRadius: radius,
            border: _focused
                ? Border.all(
                    color: ring,
                    width: AppInterfaceTokens.focusRingWidth(
                      highContrast: MediaQuery.highContrastOf(context),
                    ),
                  )
                : null,
          ),
          child: Transform.translate(
            offset: Offset(0, _pressed ? 1 : 0),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}
