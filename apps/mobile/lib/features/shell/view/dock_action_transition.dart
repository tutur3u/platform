import 'package:flutter/material.dart';

/// Animates the space actions occupy, keeping the adjacent navigation centered
/// through entry, exit, and replacement without jumping to its final slot.
class DockActionTransition extends StatelessWidget {
  const DockActionTransition({
    required this.identity,
    required this.child,
    super.key,
  });

  final Object identity;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return child;

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 360),
      reverseDuration: const Duration(milliseconds: 360),
      switchInCurve: Curves.easeInOutCubic,
      switchOutCurve: Curves.easeInOutCubic,
      transitionBuilder: (child, animation) => SizeTransition(
        axis: Axis.horizontal,
        alignment: AlignmentDirectional.centerStart,
        sizeFactor: animation,
        child: FadeTransition(opacity: animation, child: child),
      ),
      layoutBuilder: (current, previous) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final outgoing in previous)
            ExcludeSemantics(child: IgnorePointer(child: outgoing)),
          if (current != null) current,
        ],
      ),
      child: KeyedSubtree(key: ValueKey(identity), child: child),
    );
  }
}
