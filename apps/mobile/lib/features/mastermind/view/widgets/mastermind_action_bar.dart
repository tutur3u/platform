import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';

/// Pins [action] below a scrolling [body], above the shell's floating dock.
///
/// The shell publishes the dock clearance as the bottom MediaQuery padding.
/// The bar consumes it (so the dock never covers the primary action) and the
/// body no longer does, so its scroll view ends just above the bar. The bar
/// has no fill of its own: it inherits the shell background.
class MastermindStickyActionLayout extends StatelessWidget {
  const MastermindStickyActionLayout({
    required this.body,
    this.action,
    super.key,
  });

  final Widget body;

  /// The bar's content; null shows [body] alone with the usual clearance.
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final action = this.action;
    if (action == null) return body;
    return Column(
      children: [
        Expanded(
          child: MediaQuery.removePadding(
            context: context,
            removeBottom: true,
            child: body,
          ),
        ),
        MastermindActionBar(child: action),
      ],
    );
  }
}

/// The sticky primary-action bar: page gutters, a small gap, then the dock
/// clearance from the ambient bottom padding.
class MastermindActionBar extends StatelessWidget {
  const MastermindActionBar({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final insets = AppPageInsets.of(
        context,
        width: constraints.maxWidth,
        endGap: AppSpacing.sm,
      );
      return Padding(
        key: const ValueKey('mastermind-action-bar'),
        padding: EdgeInsets.fromLTRB(
          insets.left,
          AppSpacing.sm,
          insets.right,
          insets.bottom,
        ),
        // A full-width primary action, as wide as the content above it.
        child: SizedBox(width: double.infinity, child: child),
      );
    },
  );
}
