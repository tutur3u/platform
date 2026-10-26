import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/components/app_tap_target.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

class AppControlTarget extends StatefulWidget {
  const AppControlTarget({required this.child, required this.onTap, super.key});
  final Widget child;
  final VoidCallback? onTap;
  @override
  State<AppControlTarget> createState() => _AppControlTargetState();
}

class _AppControlTargetState extends State<AppControlTarget> {
  bool _focused = false;
  @override
  Widget build(BuildContext context) => FocusableActionDetector(
    enabled: widget.onTap != null,
    onShowFocusHighlight: (value) => setState(() => _focused = value),
    shortcuts: const {
      SingleActivator(LogicalKeyboardKey.space): ActivateIntent(),
      SingleActivator(LogicalKeyboardKey.enter): ActivateIntent(),
    },
    actions: {
      ActivateIntent: CallbackAction<ActivateIntent>(
        onInvoke: (_) {
          widget.onTap?.call();
          return null;
        },
      ),
    },
    child: MouseRegion(
      cursor: widget.onTap == null
          ? SystemMouseCursors.basic
          : SystemMouseCursors.click,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        child: AppTapTarget(
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: _focused
                    ? AppTokens.of(context).colorScheme.ring
                    : Colors.transparent,
                width: 2,
              ),
            ),
            child: Opacity(
              opacity: widget.onTap == null ? 0.5 : 1,
              child: widget.child,
            ),
          ),
        ),
      ),
    ),
  );
}
