import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
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
    final tokens = AppTokens.of(context);
    final sorbet = SorbetTokens.maybeOf(context);
    final focus = sorbet?.focus ?? const SorbetFocusRing();
    final ring = sorbet?.ring ?? tokens.colorScheme.ring;
    final color = tokens.colorScheme.foreground;
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
        hoverColor: color.withValues(alpha: 0.05),
        highlightColor: color.withValues(alpha: 0.08),
        focusColor: Colors.transparent,
        child: DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(
            borderRadius: radius,
            border: _focused
                ? Border.all(
                    color: ring,
                    width: MediaQuery.highContrastOf(context)
                        ? focus.highContrastWidth
                        : focus.width,
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
