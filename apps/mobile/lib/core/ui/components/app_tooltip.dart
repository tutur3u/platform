import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Tooltip styling shared by every tooltip in the app, matching web's
/// `TooltipContent`: a background surface with a 1px border, 12px foreground
/// text, 12x6 padding, shown above its target with no arrow and no delay on
/// hover. Touch keeps the platform long press.
TooltipThemeData appTooltipThemeData(AppTokens tokens) {
  final colors = tokens.colorScheme;
  return TooltipThemeData(
    decoration: BoxDecoration(
      color: colors.background,
      border: Border.all(color: colors.border),
      borderRadius: tokens.borderRadiusSm,
    ),
    textStyle: tokens.typography.xSmall.copyWith(
      color: colors.foreground,
      height: 16 / 12,
    ),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    margin: const EdgeInsets.symmetric(horizontal: 8),
    constraints: const BoxConstraints(maxWidth: 384),
    preferBelow: false,
    waitDuration: Duration.zero,
    exitDuration: const Duration(milliseconds: 100),
  );
}

/// Installs [appTooltipThemeData] for [child], so plain `tooltip:` parameters
/// on buttons and raw tooltips follow the active theme and appearance.
class AppTooltipTheme extends StatelessWidget {
  const AppTooltipTheme({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => TooltipTheme(
    data: appTooltipThemeData(AppTokens.of(context)),
    child: child,
  );
}

/// The app's tooltip. Styling comes from [AppTooltipTheme]; this adds web's
/// keyboard behaviour, opening while a descendant has keyboard focus.
class AppTooltip extends StatefulWidget {
  const AppTooltip({
    required this.message,
    required this.child,
    this.triggerMode,
    this.excludeFromSemantics,
    this.preferBelow,
    this.showDuration,
    this.tooltipKey,
    super.key,
  });

  final String message;
  final Widget child;
  final TooltipTriggerMode? triggerMode;
  final bool? excludeFromSemantics;
  final bool? preferBelow;
  final Duration? showDuration;

  /// Lets a caller show the tooltip on demand, for example on tap.
  final GlobalKey<TooltipState>? tooltipKey;

  @override
  State<AppTooltip> createState() => _AppTooltipState();
}

class _AppTooltipState extends State<AppTooltip> {
  final _ownKey = GlobalKey<TooltipState>();

  GlobalKey<TooltipState> get _tooltip => widget.tooltipKey ?? _ownKey;

  void _onFocusChange(bool focused) {
    final keyboard =
        FocusManager.instance.highlightMode == FocusHighlightMode.traditional;
    if (focused && keyboard) {
      _tooltip.currentState?.ensureTooltipVisible();
    } else if (!focused) {
      Tooltip.dismissAllToolTips();
    }
  }

  @override
  Widget build(BuildContext context) => Focus(
    canRequestFocus: false,
    skipTraversal: true,
    onFocusChange: _onFocusChange,
    child: Tooltip(
      key: _tooltip,
      message: widget.message,
      triggerMode: widget.triggerMode,
      excludeFromSemantics: widget.excludeFromSemantics,
      preferBelow: widget.preferBelow,
      showDuration: widget.showDuration,
      child: widget.child,
    ),
  );
}
