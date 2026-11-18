import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_route_fade.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// The same floating action pill used beside the normal shell navigation.
class ShellDockActionButton extends StatelessWidget {
  const ShellDockActionButton({
    required this.action,
    this.primary = true,
    super.key,
  });
  final ShellActionSpec action;
  final bool primary;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: action.tooltip ?? '',
    excludeFromSemantics: true,
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: (MediaQuery.sizeOf(context).width * .35).clamp(48, 240),
      ),
      child: FilledButton(
        clipBehavior: Clip.antiAlias,
        style: FilledButton.styleFrom(
          backgroundColor: primary
              ? Theme.of(context).colorScheme.onSurface
              : Theme.of(context).colorScheme.surfaceContainerHigh,
          foregroundColor: primary
              ? Theme.of(context).colorScheme.surface
              : Theme.of(context).colorScheme.onSurface,
          // The size of a dock slot, so the action lines up with the
          // destinations beside it.
          minimumSize: const Size.square(ShellDockMetrics.slot),
          fixedSize: const Size.fromHeight(ShellDockMetrics.slot),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          shape: const StadiumBorder(),
        ),
        onPressed: action.enabled && !action.isLoading
            ? () {
                unawaited(AppHaptics.selection());
                action.onPressed?.call();
              }
            : null,
        child: Semantics(
          label: action.tooltip,
          excludeSemantics: true,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _RouteIcon(
                child: action.isLoading
                    ? const NovaLoadingIndicator(size: 24)
                    : AnimatedSwitcher(
                        duration: const Duration(milliseconds: 220),
                        child: Icon(
                          action.icon,
                          key: ValueKey((action.id, action.icon)),
                          size: 24,
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

/// In the dock's circle, fades the icon on the route timeline over the
/// previous location's icon; elsewhere shows [child] as is.
class _RouteIcon extends StatelessWidget {
  const _RouteIcon({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final fade = ShellRouteIconFade.maybeOf(context);
    if (fade == null) return child;
    final ghostIcon = fade.ghostIcon;
    return Stack(
      alignment: Alignment.center,
      children: [
        if (ghostIcon == null)
          const SizedBox.shrink()
        else
          FadeTransition(opacity: fade.ghost, child: Icon(ghostIcon, size: 24)),
        FadeTransition(opacity: fade.live, child: child),
      ],
    );
  }
}
